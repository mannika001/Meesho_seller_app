import { Router } from "express";
import GstRecord from "../models/GstRecord.js";
import Label from "../models/Label.js";
import OrderInfo from "../models/OrderInfo.js";
import Payout from "../models/Payout.js";
import Customer from "../models/Customer.js";
import { mergedOrderPipelineStages, mergeOrderDocs } from "../services/orderAssembly.js";

const router = Router();

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const filter = {};
  if (req.query.returned === "true") filter.isReturned = true;
  if (req.query.returned === "false") filter.isReturned = false;
  if (req.query.orderStatus) filter["orderInfo.orderStatus"] = req.query.orderStatus;
  if (req.query.customerKey) filter.customerKey = req.query.customerKey;
  if (req.query.q) {
    const re = new RegExp(escapeRegex(req.query.q.trim()), "i");
    filter.$or = [{ subOrderNum: re }, { "label.customerName": re }, { "label.sku": re }];
  }

  const [orders, countResult] = await Promise.all([
    GstRecord.aggregate([
      ...mergedOrderPipelineStages(),
      { $match: filter },
      { $sort: { "gst.orderDate": -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    GstRecord.aggregate([...mergedOrderPipelineStages(), { $match: filter }, { $count: "total" }]),
  ]);
  const total = countResult[0]?.total ?? 0;

  // Enrich with each order's customer risk profile (repeat/return-rate/scam
  // tag) — one extra query for the whole page, not per row.
  const customerKeys = [...new Set(orders.map((o) => o.customerKey).filter(Boolean))];
  const customers = customerKeys.length
    ? await Customer.find({ customerKey: { $in: customerKeys } })
        .select("customerKey isRepeat returnRate scamTag")
        .lean()
    : [];
  const customerMap = new Map(customers.map((c) => [c.customerKey, c]));
  const enrichedOrders = orders.map((o) => ({
    ...o,
    customer: o.customerKey ? customerMap.get(o.customerKey) || null : null,
  }));

  res.json({ ok: true, orders: enrichedOrders, total, page, limit });
});

// Overall snapshot across every uploaded order (not scoped to a single
// upload batch) — total orders, status breakdown, and the order-date range
// the data actually spans, so a stat like "0 cancelled" is legible as real
// vs. "nothing uploaded yet".
// Shared by exclusiveDelivered's count and its revenue sum below, so the two
// stay in lockstep instead of two copies of the same condition drifting apart.
const EXCLUSIVE_DELIVERED_COND = {
  $and: [
    { $ne: ["$isReturned", true] },
    {
      $or: [
        { $eq: ["$orderInfo.orderStatus", "DELIVERED"] },
        {
          $and: [
            { $eq: ["$payout.payoutStatus", "SETTLED"] },
            { $not: [{ $ifNull: ["$orderInfo.orderStatus", false] }] },
          ],
        },
      ],
    },
  ],
};

router.get("/stats", async (req, res) => {
  const [statusAgg] = await GstRecord.aggregate([
    ...mergedOrderPipelineStages(),
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        // Counts DELIVERED from the Orders Excel export, plus orders with no
        // orderInfo yet (Orders Excel not uploaded for them) but a SETTLED
        // payout and no return recorded — Meesho only settles payout after
        // delivery, so this keeps "delivered" moving in lockstep with money
        // made instead of waiting on a second file upload.
        delivered: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $eq: ["$orderInfo.orderStatus", "DELIVERED"] },
                  {
                    $and: [
                      { $eq: ["$payout.payoutStatus", "SETTLED"] },
                      { $not: [{ $ifNull: ["$orderInfo.orderStatus", false] }] },
                      { $ne: ["$isReturned", true] },
                    ],
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
        cancelled: { $sum: { $cond: [{ $eq: ["$orderInfo.orderStatus", "CANCELLED"] }, 1, 0] } },
        rto: { $sum: { $cond: [{ $eq: ["$orderInfo.orderStatus", "RTO_COMPLETE"] }, 1, 0] } },
        returned: { $sum: { $cond: ["$isReturned", 1, 0] } },
        // Mutually-exclusive breakdown that sums to totalOrders, unlike the
        // 4 stats above (which overlap: a CANCELLED or RTO_COMPLETE order
        // can also carry isReturned=true from the GST returns sheet, and
        // "delivered" doesn't currently exclude isReturned either). Here
        // isReturned wins first — a return/credit-note entry is a real event
        // that happened regardless of what status Orders Excel recorded —
        // then status, then "other" for orders with no status/return data.
        exclusiveReturned: { $sum: { $cond: ["$isReturned", 1, 0] } },
        // Settled payout tied to returned orders — usually negative (Meesho
        // deducting for the return), so this is a loss figure, not revenue.
        exclusiveReturnedRevenue: {
          $sum: {
            $cond: [
              { $and: ["$isReturned", { $eq: ["$payout.payoutStatus", "SETTLED"] }] },
              { $ifNull: ["$payout.payoutValue", 0] },
              0,
            ],
          },
        },
        exclusiveDelivered: { $sum: { $cond: [EXCLUSIVE_DELIVERED_COND, 1, 0] } },
        // Settled revenue restricted to exclusively-delivered orders — unlike
        // settledRevenue below, this excludes negative-settled returns, so it
        // reads as "money earned from orders that actually stayed delivered."
        exclusiveDeliveredRevenue: {
          $sum: {
            $cond: [
              { $and: [EXCLUSIVE_DELIVERED_COND, { $eq: ["$payout.payoutStatus", "SETTLED"] }] },
              { $ifNull: ["$payout.payoutValue", 0] },
              0,
            ],
          },
        },
        exclusiveCancelled: {
          $sum: {
            $cond: [
              { $and: [{ $ne: ["$isReturned", true] }, { $eq: ["$orderInfo.orderStatus", "CANCELLED"] }] },
              1,
              0,
            ],
          },
        },
        exclusiveRto: {
          $sum: {
            $cond: [
              { $and: [{ $ne: ["$isReturned", true] }, { $eq: ["$orderInfo.orderStatus", "RTO_COMPLETE"] }] },
              1,
              0,
            ],
          },
        },
        // Money actually settled to the bank — driven only by the Order
        // Summary file's own Payout Status column, not orderInfo.orderStatus
        // (which comes from a *different* file, the Orders Excel export).
        // Tying this to "DELIVERED" meant it silently ignored any month
        // where only Order Summary had been uploaded — this way it updates
        // the moment Order Summary data lands, nothing else required. Nets
        // in negative-settled returns too, which is the honest number.
        settledRevenue: {
          $sum: { $cond: [{ $eq: ["$payout.payoutStatus", "SETTLED"] }, { $ifNull: ["$payout.payoutValue", 0] }, 0] },
        },
      },
    },
  ]);
  const [dateRange] = await GstRecord.aggregate([
    { $match: { "gst.orderDate": { $ne: null } } },
    { $group: { _id: null, earliest: { $min: "$gst.orderDate" }, latest: { $max: "$gst.orderDate" } } },
  ]);
  // Same date-range idea, but scoped to only the orders that actually
  // contributed to settledRevenue — falls back to the Order Summary file's
  // own order date when the GST report hasn't been uploaded for that order.
  // Only Payout + GstRecord are involved, so a 2-collection lookup here
  // instead of the full 4-way union.
  const [settledRevenueDateRange] = await Payout.aggregate([
    { $match: { "payout.payoutStatus": "SETTLED" } },
    {
      $lookup: {
        from: "gstrecords",
        localField: "subOrderNum",
        foreignField: "subOrderNum",
        as: "gstDoc",
      },
    },
    { $unwind: { path: "$gstDoc", preserveNullAndEmptyArrays: true } },
    { $addFields: { effectiveOrderDate: { $ifNull: ["$gstDoc.gst.orderDate", "$payout.orderDate"] } } },
    { $match: { effectiveOrderDate: { $ne: null } } },
    { $group: { _id: null, earliest: { $min: "$effectiveOrderDate" }, latest: { $max: "$effectiveOrderDate" } } },
  ]);
  const totalOrders = statusAgg?.totalOrders ?? 0;
  const exclusiveDelivered = statusAgg?.exclusiveDelivered ?? 0;
  const exclusiveCancelled = statusAgg?.exclusiveCancelled ?? 0;
  const exclusiveRto = statusAgg?.exclusiveRto ?? 0;
  const exclusiveReturned = statusAgg?.exclusiveReturned ?? 0;

  res.json({
    ok: true,
    totalOrders,
    delivered: statusAgg?.delivered ?? 0,
    cancelled: statusAgg?.cancelled ?? 0,
    rto: statusAgg?.rto ?? 0,
    returned: statusAgg?.returned ?? 0,
    settledRevenue: statusAgg?.settledRevenue ?? 0,
    settledRevenueFrom: settledRevenueDateRange?.earliest ?? null,
    settledRevenueTo: settledRevenueDateRange?.latest ?? null,
    earliestOrderDate: dateRange?.earliest ?? null,
    latestOrderDate: dateRange?.latest ?? null,
    // Mutually-exclusive breakdown — always sums to totalOrders, unlike the
    // fields above. "other" is orders with no status/return data at all yet.
    exclusive: {
      delivered: exclusiveDelivered,
      deliveredRevenue: statusAgg?.exclusiveDeliveredRevenue ?? 0,
      cancelled: exclusiveCancelled,
      rto: exclusiveRto,
      returned: exclusiveReturned,
      returnedRevenue: statusAgg?.exclusiveReturnedRevenue ?? 0,
      other: Math.max(0, totalOrders - exclusiveDelivered - exclusiveCancelled - exclusiveRto - exclusiveReturned),
    },
  });
});

router.get("/:subOrderNum", async (req, res) => {
  const { subOrderNum } = req.params;
  const [gstDoc, labelDoc, orderInfoDoc, payoutDoc] = await Promise.all([
    GstRecord.findOne({ subOrderNum }).lean(),
    Label.findOne({ subOrderNum }).lean(),
    OrderInfo.findOne({ subOrderNum }).lean(),
    Payout.findOne({ subOrderNum }).lean(),
  ]);
  if (!gstDoc && !labelDoc && !orderInfoDoc && !payoutDoc) {
    return res.status(404).json({ ok: false, message: "Order not found" });
  }
  const order = mergeOrderDocs(subOrderNum, { gstDoc, labelDoc, orderInfoDoc, payoutDoc });
  res.json({ ok: true, order });
});

export default router;

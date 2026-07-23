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
    OrderInfo.aggregate([
      ...mergedOrderPipelineStages(),
      { $match: filter },
      { $sort: { "gst.orderDate": -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    OrderInfo.aggregate([...mergedOrderPipelineStages(), { $match: filter }, { $count: "total" }]),
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
// A GST-returns-sheet entry only means a genuine customer return if the order
// was actually DELIVERED (or has no orderInfo status yet at all). A CANCELLED
// or RTO_COMPLETE order can also carry a GST return-sheet row — that's Meesho
// reversing tax for the cancellation/RTO itself, not a customer sending
// something back — so it must stay counted as CANCELLED/RTO, not "returned".
// Only used as a fallback below, for orders where Order Summary (and its own
// authoritative Order Status column) hasn't been uploaded yet.
export const TRUE_RETURN_COND = {
  $and: [
    "$isReturned",
    {
      $or: [
        { $eq: ["$orderInfo.orderStatus", "DELIVERED"] },
        { $not: [{ $ifNull: ["$orderInfo.orderStatus", false] }] },
      ],
    },
  ],
};

// Order Summary's own "Order Status" column (Delivered/Cancelled/RTO/Returned)
// is the one authoritative, mutually-exclusive status per order — it's the
// only file with 100% coverage and the only one with a literal "Returned"
// value. Falls back to the Orders export status + GST-returns heuristic only
// for orders Order Summary hasn't been uploaded for yet.
const EFFECTIVE_STATUS = {
  $switch: {
    branches: [
      { case: { $eq: ["$payout.orderStatus", "Returned"] }, then: "RETURNED" },
      { case: { $eq: ["$payout.orderStatus", "Delivered"] }, then: "DELIVERED" },
      { case: { $eq: ["$payout.orderStatus", "Cancelled"] }, then: "CANCELLED" },
      { case: { $eq: ["$payout.orderStatus", "RTO"] }, then: "RTO" },
      { case: TRUE_RETURN_COND, then: "RETURNED" },
      { case: { $eq: ["$orderInfo.orderStatus", "DELIVERED"] }, then: "DELIVERED" },
      { case: { $eq: ["$orderInfo.orderStatus", "CANCELLED"] }, then: "CANCELLED" },
      { case: { $eq: ["$orderInfo.orderStatus", "RTO_COMPLETE"] }, then: "RTO" },
      // Meesho only settles payout after delivery, so a SETTLED payout with
      // no status from either file yet still reads as delivered.
      {
        case: {
          $and: [
            { $eq: ["$payout.payoutStatus", "SETTLED"] },
            { $not: [{ $ifNull: ["$orderInfo.orderStatus", false] }] },
          ],
        },
        then: "DELIVERED",
      },
    ],
    default: "OTHER",
  },
};

router.get("/stats", async (req, res) => {
  const [statusAgg] = await OrderInfo.aggregate([
    ...mergedOrderPipelineStages(),
    { $addFields: { effectiveStatus: EFFECTIVE_STATUS } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        delivered: { $sum: { $cond: [{ $eq: ["$effectiveStatus", "DELIVERED"] }, 1, 0] } },
        deliveredRevenue: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$effectiveStatus", "DELIVERED"] }, { $eq: ["$payout.payoutStatus", "SETTLED"] }] },
              { $ifNull: ["$payout.payoutValue", 0] },
              0,
            ],
          },
        },
        cancelled: { $sum: { $cond: [{ $eq: ["$effectiveStatus", "CANCELLED"] }, 1, 0] } },
        rto: { $sum: { $cond: [{ $eq: ["$effectiveStatus", "RTO"] }, 1, 0] } },
        returned: { $sum: { $cond: [{ $eq: ["$effectiveStatus", "RETURNED"] }, 1, 0] } },
        // Settled payout tied to returned orders — usually negative (Meesho
        // deducting for the return), so this is a loss figure, not revenue.
        returnedRevenue: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$effectiveStatus", "RETURNED"] }, { $eq: ["$payout.payoutStatus", "SETTLED"] }] },
              { $ifNull: ["$payout.payoutValue", 0] },
              0,
            ],
          },
        },
        other: { $sum: { $cond: [{ $eq: ["$effectiveStatus", "OTHER"] }, 1, 0] } },
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
  const delivered = statusAgg?.delivered ?? 0;
  const cancelled = statusAgg?.cancelled ?? 0;
  const rto = statusAgg?.rto ?? 0;
  const returned = statusAgg?.returned ?? 0;
  const other = statusAgg?.other ?? 0;

  res.json({
    ok: true,
    totalOrders,
    delivered,
    cancelled,
    rto,
    returned,
    settledRevenue: statusAgg?.settledRevenue ?? 0,
    settledRevenueFrom: settledRevenueDateRange?.earliest ?? null,
    settledRevenueTo: settledRevenueDateRange?.latest ?? null,
    earliestOrderDate: dateRange?.earliest ?? null,
    latestOrderDate: dateRange?.latest ?? null,
    // Same 4 numbers as above, restated as a mutually-exclusive breakdown that
    // sums to totalOrders (kept for API back-compat — every order now has
    // exactly one effectiveStatus, so this is no longer a distinct
    // computation from the fields above).
    exclusive: {
      delivered,
      deliveredRevenue: statusAgg?.deliveredRevenue ?? 0,
      cancelled,
      rto,
      returned,
      returnedRevenue: statusAgg?.returnedRevenue ?? 0,
      other,
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

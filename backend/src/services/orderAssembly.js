// Reassembles the frontend's flat Order shape ({ subOrderNum, gst, returnInfo,
// isReturned, orderInfo, payout, label, customerKey, sourceBatchIds }) from the
// 4 source-specific collections (GstRecord, Label, OrderInfo, Payout), keeping
// the API contract unchanged while storage is split by upload source.

// Aggregation pipeline stages: union subOrderNum across OrderInfo + Payout only
// (an order only counts once it's shown up in the Orders export or the Order
// Summary/payments export — those are the two files that actually represent a
// placed order), then $lookup GstRecord/Label back in as enrichment for orders
// that have them, and reshape to the original nested Order shape. A subOrderNum
// that only ever appears in the GST TCS report or a shipping label (no Orders/
// Order Summary row) is excluded — it isn't a confirmed order, and including it
// inflated totalOrders by ~50 rows past the reconciled Orders/Order Summary count.
// Callers must call this via OrderInfo.aggregate([...]) (or Payout.aggregate),
// not GstRecord.aggregate — the first stage projects off whichever model
// .aggregate() was invoked on.
// Callers append their own $match/$sort/$group/etc. after these stages.
export function mergedOrderPipelineStages() {
  return [
    { $project: { _id: 0, subOrderNum: 1 } },
    { $unionWith: { coll: "payouts", pipeline: [{ $project: { _id: 0, subOrderNum: 1 } }] } },
    { $group: { _id: "$subOrderNum" } },
    {
      $lookup: {
        from: "gstrecords",
        localField: "_id",
        foreignField: "subOrderNum",
        as: "gstDoc",
      },
    },
    { $unwind: { path: "$gstDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "labels",
        localField: "_id",
        foreignField: "subOrderNum",
        as: "labelDoc",
      },
    },
    { $unwind: { path: "$labelDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "orderinfos",
        localField: "_id",
        foreignField: "subOrderNum",
        as: "orderInfoDoc",
      },
    },
    { $unwind: { path: "$orderInfoDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "payouts",
        localField: "_id",
        foreignField: "subOrderNum",
        as: "payoutDoc",
      },
    },
    { $unwind: { path: "$payoutDoc", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        subOrderNum: "$_id",
        gst: "$gstDoc.gst",
        returnInfo: "$gstDoc.returnInfo",
        isReturned: { $ifNull: ["$gstDoc.isReturned", false] },
        orderInfo: "$orderInfoDoc.orderInfo",
        payout: "$payoutDoc.payout",
        label: "$labelDoc.label",
        customerKey: "$labelDoc.customerKey",
        sourceBatchIds: {
          $setUnion: [
            { $ifNull: ["$gstDoc.sourceBatchIds", []] },
            { $ifNull: ["$labelDoc.sourceBatchIds", []] },
            { $ifNull: ["$orderInfoDoc.sourceBatchIds", []] },
            { $ifNull: ["$payoutDoc.sourceBatchIds", []] },
          ],
        },
      },
    },
    { $project: { gstDoc: 0, labelDoc: 0, orderInfoDoc: 0, payoutDoc: 0 } },
  ];
}

// Same reshape as a plain function, for single-subOrderNum lookups where an
// aggregation is overkill (4 parallel findOne calls instead).
export function mergeOrderDocs(subOrderNum, { gstDoc, labelDoc, orderInfoDoc, payoutDoc }) {
  return {
    subOrderNum,
    gst: gstDoc?.gst,
    returnInfo: gstDoc?.returnInfo,
    isReturned: gstDoc?.isReturned ?? false,
    orderInfo: orderInfoDoc?.orderInfo,
    payout: payoutDoc?.payout,
    label: labelDoc?.label,
    customerKey: labelDoc?.customerKey,
    sourceBatchIds: [
      ...(gstDoc?.sourceBatchIds ?? []),
      ...(labelDoc?.sourceBatchIds ?? []),
      ...(orderInfoDoc?.sourceBatchIds ?? []),
      ...(payoutDoc?.sourceBatchIds ?? []),
    ],
  };
}

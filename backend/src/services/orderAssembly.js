// Reassembles the frontend's flat Order shape ({ subOrderNum, gst, returnInfo,
// isReturned, orderInfo, payout, label, customerKey, sourceBatchIds }) from the
// 4 source-specific collections (GstRecord, Label, OrderInfo, Payout), keeping
// the API contract unchanged while storage is split by upload source.

// Aggregation pipeline stages: union subOrderNum across all 4 collections,
// $lookup each one back in, then reshape to the original nested Order shape.
// Callers append their own $match/$sort/$group/etc. after these stages.
export function mergedOrderPipelineStages() {
  return [
    { $project: { _id: 0, subOrderNum: 1 } },
    { $unionWith: { coll: "labels", pipeline: [{ $project: { _id: 0, subOrderNum: 1 } }] } },
    { $unionWith: { coll: "orderinfos", pipeline: [{ $project: { _id: 0, subOrderNum: 1 } }] } },
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

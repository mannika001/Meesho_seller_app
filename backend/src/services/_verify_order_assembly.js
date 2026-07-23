import { connectDb } from "../db/connect.js";
import mongoose from "mongoose";
import GstRecord from "../models/GstRecord.js";
import Label from "../models/Label.js";
import OrderInfo from "../models/OrderInfo.js";
import Payout from "../models/Payout.js";
import { mergedOrderPipelineStages, mergeOrderDocs } from "./orderAssembly.js";

// Seeds one synthetic subOrderNum across all 4 collections with distinct
// known values, then checks the detail-path (mergeOrderDocs) and list-path
// (mergedOrderPipelineStages aggregation) produce the identical merged shape.

const SUB_ORDER_NUM = "TESTVERIFY_assembly_1";
const GST_ONLY_SUB_ORDER_NUM = "TESTVERIFY_gstonly_1"; // no OrderInfo/Payout row — must be excluded from the list path

const seedData = {
  gst: { gst: { orderDate: new Date("2026-02-01"), totalInvoiceValue: 500 }, isReturned: false },
  label: { label: { customerName: "Assembly Test", pincode: "555555", sku: "SKU-1" }, customerKey: "test_assembly_555555" },
  orderInfo: { orderInfo: { orderStatus: "DELIVERED", catalogId: "CAT-1" } },
  payout: { payout: { payoutStatus: "SETTLED", payoutValue: 450 } },
};

function assertMerged(label, order) {
  const checks = [
    ["subOrderNum", order.subOrderNum, SUB_ORDER_NUM],
    ["gst.totalInvoiceValue", order.gst?.totalInvoiceValue, 500],
    ["isReturned", order.isReturned, false],
    ["orderInfo.orderStatus", order.orderInfo?.orderStatus, "DELIVERED"],
    ["payout.payoutValue", order.payout?.payoutValue, 450],
    ["label.sku", order.label?.sku, "SKU-1"],
    ["customerKey", order.customerKey, "test_assembly_555555"],
  ];
  let pass = true;
  for (const [field, got, expected] of checks) {
    const ok = got === expected;
    if (!ok) pass = false;
    console.log(ok ? "PASS" : "FAIL", `${label}: ${field} = ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`);
  }
  return pass;
}

async function cleanup() {
  await Promise.all([
    GstRecord.deleteMany({ subOrderNum: { $in: [SUB_ORDER_NUM, GST_ONLY_SUB_ORDER_NUM] } }),
    Label.deleteMany({ subOrderNum: SUB_ORDER_NUM }),
    OrderInfo.deleteMany({ subOrderNum: SUB_ORDER_NUM }),
    Payout.deleteMany({ subOrderNum: SUB_ORDER_NUM }),
  ]);
}

async function main() {
  await connectDb();
  await cleanup();

  await Promise.all([
    GstRecord.create({ subOrderNum: SUB_ORDER_NUM, ...seedData.gst }),
    Label.create({ subOrderNum: SUB_ORDER_NUM, ...seedData.label }),
    OrderInfo.create({ subOrderNum: SUB_ORDER_NUM, ...seedData.orderInfo }),
    Payout.create({ subOrderNum: SUB_ORDER_NUM, ...seedData.payout }),
    // GST-only row, no OrderInfo/Payout — should never surface in the list path.
    GstRecord.create({ subOrderNum: GST_ONLY_SUB_ORDER_NUM, gst: { totalInvoiceValue: 999 } }),
  ]);

  // Detail path: 4 parallel findOnes + plain-function merge.
  const [gstDoc, labelDoc, orderInfoDoc, payoutDoc] = await Promise.all([
    GstRecord.findOne({ subOrderNum: SUB_ORDER_NUM }).lean(),
    Label.findOne({ subOrderNum: SUB_ORDER_NUM }).lean(),
    OrderInfo.findOne({ subOrderNum: SUB_ORDER_NUM }).lean(),
    Payout.findOne({ subOrderNum: SUB_ORDER_NUM }).lean(),
  ]);
  const detailOrder = mergeOrderDocs(SUB_ORDER_NUM, { gstDoc, labelDoc, orderInfoDoc, payoutDoc });
  const detailPass = assertMerged("detail-path", detailOrder);

  // List path: aggregation pipeline, filtered down to just our test row.
  const [listOrder] = await OrderInfo.aggregate([
    ...mergedOrderPipelineStages(),
    { $match: { subOrderNum: SUB_ORDER_NUM } },
  ]);
  const listPass = assertMerged("list-path", listOrder || {});

  // A subOrderNum with only a GstRecord (no OrderInfo/Payout) must not appear
  // in the list path — it isn't a confirmed order, just a GST-report row.
  const gstOnlyMatches = await OrderInfo.aggregate([
    ...mergedOrderPipelineStages(),
    { $match: { subOrderNum: GST_ONLY_SUB_ORDER_NUM } },
  ]);
  const exclusionPass = gstOnlyMatches.length === 0;
  console.log(
    exclusionPass ? "PASS" : "FAIL",
    `exclusion: GST-only subOrderNum found in list = ${gstOnlyMatches.length} (expected 0)`
  );

  await cleanup();

  const allPass = detailPass && listPass && exclusionPass;
  console.log(allPass ? "\nALL ORDER ASSEMBLY CHECKS PASSED" : "\nSOME CHECKS FAILED");
  await mongoose.disconnect();
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

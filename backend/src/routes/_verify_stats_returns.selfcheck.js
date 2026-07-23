import { connectDb } from "../db/connect.js";
import mongoose from "mongoose";
import GstRecord from "../models/GstRecord.js";
import OrderInfo from "../models/OrderInfo.js";
import Payout from "../models/Payout.js";
import { mergedOrderPipelineStages } from "../services/orderAssembly.js";
import { TRUE_RETURN_COND } from "./orders.js";

// A GST-return-sheet entry on a CANCELLED/RTO order is a tax reversal for
// that cancellation, not a customer return — TRUE_RETURN_COND must only fire
// for DELIVERED (or status-less) orders. This seeds one order per status,
// all flagged isReturned=true, and checks only the DELIVERED one counts.

const CASES = [
  { subOrderNum: "TESTVERIFY_ret_delivered", orderStatus: "DELIVERED", expectTrueReturn: true },
  { subOrderNum: "TESTVERIFY_ret_cancelled", orderStatus: "CANCELLED", expectTrueReturn: false },
  { subOrderNum: "TESTVERIFY_ret_rto", orderStatus: "RTO_COMPLETE", expectTrueReturn: false },
  { subOrderNum: "TESTVERIFY_ret_nostatus", orderStatus: null, expectTrueReturn: true },
];

async function cleanup() {
  const ids = CASES.map((c) => c.subOrderNum);
  await Promise.all([
    GstRecord.deleteMany({ subOrderNum: { $in: ids } }),
    OrderInfo.deleteMany({ subOrderNum: { $in: ids } }),
    Payout.deleteMany({ subOrderNum: { $in: ids } }),
  ]);
}

async function main() {
  await connectDb();
  await cleanup();

  await Promise.all(
    CASES.flatMap((c) => [
      GstRecord.create({ subOrderNum: c.subOrderNum, isReturned: true, returnInfo: {} }),
      Payout.create({ subOrderNum: c.subOrderNum, payout: { payoutStatus: "SETTLED", payoutValue: 100 } }),
      ...(c.orderStatus
        ? [OrderInfo.create({ subOrderNum: c.subOrderNum, orderInfo: { orderStatus: c.orderStatus } })]
        : []),
    ])
  );

  const rows = await OrderInfo.aggregate([
    ...mergedOrderPipelineStages(),
    { $match: { subOrderNum: { $in: CASES.map((c) => c.subOrderNum) } } },
    { $project: { subOrderNum: 1, isTrueReturn: { $cond: [TRUE_RETURN_COND, true, false] } } },
  ]);
  const bySubOrder = new Map(rows.map((r) => [r.subOrderNum, r.isTrueReturn]));

  let allPass = true;
  for (const c of CASES) {
    const got = bySubOrder.get(c.subOrderNum);
    const ok = got === c.expectTrueReturn;
    if (!ok) allPass = false;
    console.log(
      ok ? "PASS" : "FAIL",
      `${c.subOrderNum} (status=${c.orderStatus}): isTrueReturn=${got} (expected ${c.expectTrueReturn})`
    );
  }

  await cleanup();
  console.log(allPass ? "\nALL TRUE_RETURN_COND CHECKS PASSED" : "\nSOME CHECKS FAILED");
  await mongoose.disconnect();
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

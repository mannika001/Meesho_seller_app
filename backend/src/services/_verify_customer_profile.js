import { connectDb } from "../db/connect.js";
import mongoose from "mongoose";
import GstRecord from "../models/GstRecord.js";
import Label from "../models/Label.js";
import Customer from "../models/Customer.js";
import { recomputeAllCustomers, computeScamTag } from "./customerProfile.js";
import { config } from "../config.js";

// Seeds synthetic GstRecord/Label docs (bypassing the parsing pipeline) to
// test recomputeAllCustomers()/computeScamTag() against hand-calculated
// values, then removes them and restores the real customer profiles.

const TEST_PREFIX = "TESTVERIFY_";

async function seed() {
  const docs = [
    // little_scammy: 4 orders, 2 returned -> return rate 0.5 (>0.3, <=0.6)
    ...Array.from({ length: 4 }, (_, i) => ({
      subOrderNum: `${TEST_PREFIX}little_${i}`,
      customerKey: "test_little_scammy_111111",
      isReturned: i < 2,
      label: { customerName: "Little Scammy", pincode: "111111" },
    })),
    // total_scammy: 5 orders, 4 returned -> return rate 0.8 (>0.6)
    ...Array.from({ length: 5 }, (_, i) => ({
      subOrderNum: `${TEST_PREFIX}total_${i}`,
      customerKey: "test_total_scammy_222222",
      isReturned: i < 4,
      label: { customerName: "Total Scammy", pincode: "222222" },
    })),
    // repeat but not enough data: 2 orders, 0 returned -> isRepeat true, not_enough_data (below min 3)
    ...Array.from({ length: 2 }, (_, i) => ({
      subOrderNum: `${TEST_PREFIX}repeat_${i}`,
      customerKey: "test_repeat_only_333333",
      isReturned: false,
      label: { customerName: "Repeat Only", pincode: "333333" },
    })),
    // exactly at the min-orders boundary: 3 orders, 0 returned -> "none" (enough data, 0% return rate)
    ...Array.from({ length: 3 }, (_, i) => ({
      subOrderNum: `${TEST_PREFIX}boundary_${i}`,
      customerKey: "test_boundary_444444",
      isReturned: false,
      label: { customerName: "Boundary Case", pincode: "444444" },
    })),
  ];
  await GstRecord.insertMany(docs.map(({ subOrderNum, isReturned }) => ({ subOrderNum, isReturned })));
  await Label.insertMany(docs.map(({ subOrderNum, customerKey, label }) => ({ subOrderNum, customerKey, label })));
}

async function main() {
  await connectDb();

  console.log("SCAM_MIN_ORDERS =", config.scam.minOrders, "little=", config.scam.littleThreshold, "total=", config.scam.totalThreshold);

  // Unit-test computeScamTag directly against hand-calculated expectations.
  const unitCases = [
    { totalOrders: 2, returnRate: 1.0, expected: "not_enough_data" }, // below min orders regardless of rate
    { totalOrders: 3, returnRate: 0, expected: "none" },
    { totalOrders: 4, returnRate: 0.5, expected: "little_scammy" },
    { totalOrders: 5, returnRate: 0.8, expected: "total_scammy" },
    { totalOrders: 5, returnRate: 0.3, expected: "none" }, // exactly at threshold, not above it
    { totalOrders: 5, returnRate: 0.6, expected: "little_scammy" }, // exactly at total threshold, not above it
  ];
  let unitPass = true;
  for (const c of unitCases) {
    const got = computeScamTag(c.totalOrders, c.returnRate);
    const ok = got === c.expected;
    if (!ok) unitPass = false;
    console.log(ok ? "PASS" : "FAIL", `computeScamTag(${c.totalOrders}, ${c.returnRate}) = ${got} (expected ${c.expected})`);
  }

  await seed();
  await recomputeAllCustomers();

  const checks = [
    { key: "test_little_scammy_111111", totalOrders: 4, returnedOrders: 2, returnRate: 0.5, isRepeat: true, scamTag: "little_scammy" },
    { key: "test_total_scammy_222222", totalOrders: 5, returnedOrders: 4, returnRate: 0.8, isRepeat: true, scamTag: "total_scammy" },
    { key: "test_repeat_only_333333", totalOrders: 2, returnedOrders: 0, returnRate: 0, isRepeat: true, scamTag: "not_enough_data" },
    { key: "test_boundary_444444", totalOrders: 3, returnedOrders: 0, returnRate: 0, isRepeat: true, scamTag: "none" },
  ];

  let allPass = unitPass;
  for (const c of checks) {
    const doc = await Customer.findOne({ customerKey: c.key }).lean();
    const ok =
      doc &&
      doc.totalOrders === c.totalOrders &&
      doc.returnedOrders === c.returnedOrders &&
      Math.abs(doc.returnRate - c.returnRate) < 1e-9 &&
      doc.isRepeat === c.isRepeat &&
      doc.scamTag === c.scamTag;
    if (!ok) allPass = false;
    console.log(ok ? "PASS" : "FAIL", c.key, doc);
  }

  // Cleanup: remove synthetic docs, recompute again to restore real state.
  await GstRecord.deleteMany({ subOrderNum: { $regex: `^${TEST_PREFIX}` } });
  await Label.deleteMany({ subOrderNum: { $regex: `^${TEST_PREFIX}` } });
  await recomputeAllCustomers();

  console.log(allPass ? "\nALL CUSTOMER PROFILE CHECKS PASSED" : "\nSOME CHECKS FAILED");
  await mongoose.disconnect();
  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

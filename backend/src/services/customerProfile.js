import Label from "../models/Label.js";
import GstRecord from "../models/GstRecord.js";
import Customer from "../models/Customer.js";
import { config } from "../config.js";

export function computeScamTag(totalOrders, returnRate, cfg = config.scam) {
  if (totalOrders < cfg.minOrders) return "not_enough_data";
  if (returnRate > cfg.totalThreshold) return "total_scammy";
  if (returnRate > cfg.littleThreshold) return "little_scammy";
  return "none";
}

// Derived/cache collection: always fully recomputed from `orders`, never
// patched incrementally. Dataset is small (a few hundred customers at most)
// so a full wipe+rebuild is fast and side-steps stale-key edge cases (e.g. a
// re-uploaded label correcting a name/pincode typo would change customerKey).
export async function recomputeAllCustomers() {
  // customerKey only ever lives on Label docs, so that's the driver; isReturned
  // lives on GstRecord and gets joined in by subOrderNum.
  const labelDocs = await Label.find({ customerKey: { $exists: true, $ne: null } })
    .select("subOrderNum customerKey label.customerName label.pincode label.address label.city label.state")
    .lean();
  const gstDocs = await GstRecord.find({ subOrderNum: { $in: labelDocs.map((d) => d.subOrderNum) } })
    .select("subOrderNum isReturned")
    .lean();
  const returnedSet = new Set(gstDocs.filter((g) => g.isReturned).map((g) => g.subOrderNum));

  const groups = new Map();
  for (const order of labelDocs) {
    if (!order.customerKey) continue;
    const g = groups.get(order.customerKey) || {
      displayName: order.label?.customerName || "",
      pincode: order.label?.pincode || "",
      address: order.label?.address || "",
      state: order.label?.state || "",
      subOrderNums: [],
      returnedOrders: 0,
    };
    g.subOrderNums.push(order.subOrderNum);
    if (returnedSet.has(order.subOrderNum)) g.returnedOrders += 1;
    if (order.label?.customerName) g.displayName = order.label.customerName;
    if (order.label?.state) g.state = order.label.state;
    if (order.label?.address) {
      g.address = [order.label.address, order.label.city, order.label.state]
        .filter(Boolean)
        .join(", ");
    }
    groups.set(order.customerKey, g);
  }

  const docs = [];
  for (const [customerKey, g] of groups) {
    const totalOrders = g.subOrderNums.length;
    const returnRate = totalOrders > 0 ? g.returnedOrders / totalOrders : 0;
    docs.push({
      customerKey,
      displayName: g.displayName,
      address: g.address,
      state: g.state,
      pincode: g.pincode,
      totalOrders,
      returnedOrders: g.returnedOrders,
      returnRate,
      isRepeat: totalOrders >= 2,
      scamTag: computeScamTag(totalOrders, returnRate),
      subOrderNums: g.subOrderNums,
    });
  }

  await Customer.deleteMany({});
  if (docs.length) await Customer.insertMany(docs);

  return { customersComputed: docs.length };
}

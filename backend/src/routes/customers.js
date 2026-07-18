import { Router } from "express";
import Customer from "../models/Customer.js";

const router = Router();

router.get("/", async (req, res) => {
  const filter = {};
  const tag = req.query.tag;
  if (tag === "repeat") filter.isRepeat = true;
  else if (tag === "little_scammy" || tag === "total_scammy" || tag === "none" || tag === "not_enough_data") {
    filter.scamTag = tag;
  }
  const customers = await Customer.find(filter).sort({ totalOrders: -1 }).lean();
  res.json({ ok: true, customers, total: customers.length });
});

router.get("/:customerKey", async (req, res) => {
  const customer = await Customer.findOne({ customerKey: req.params.customerKey }).lean();
  if (!customer) return res.status(404).json({ ok: false, message: "Customer not found" });
  res.json({ ok: true, customer });
});

export default router;

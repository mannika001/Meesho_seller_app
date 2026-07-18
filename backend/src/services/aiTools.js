import { Type } from "@google/genai";
import GstRecord from "../models/GstRecord.js";
import Customer from "../models/Customer.js";
import { mergedOrderPipelineStages } from "./orderAssembly.js";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const toolDeclarations = [
  {
    name: "get_stats",
    description:
      "Aggregate totals over the seller's whole dataset: order count, returned count, return rate, revenue sum, customer count, repeat-customer count. Use for any question about totals, rates, or counts rather than counting rows yourself.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "search_orders",
    description:
      "Look up individual orders filtered by date range, customer name, SKU, state, or return status. Returns matching order rows (capped at `limit`).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        dateFrom: { type: Type.STRING, description: "ISO date, inclusive lower bound on orderDate" },
        dateTo: { type: Type.STRING, description: "ISO date, inclusive upper bound on orderDate" },
        customerName: { type: Type.STRING, description: "Substring match, case-insensitive" },
        sku: { type: Type.STRING, description: "Substring match, case-insensitive" },
        state: { type: Type.STRING, description: "Exact end-customer state, case-insensitive" },
        returned: { type: Type.BOOLEAN, description: "Filter to returned (true) or not-returned (false) orders" },
        limit: { type: Type.NUMBER, description: "Max rows to return, default 50, max 200" },
      },
    },
  },
  {
    name: "search_customers",
    description:
      "Look up individual customers filtered by scam tag, repeat status, or pincode. Returns matching customer rows (capped at `limit`).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        scamTag: {
          type: Type.STRING,
          enum: ["none", "little_scammy", "total_scammy", "not_enough_data"],
        },
        isRepeat: { type: Type.BOOLEAN },
        pincode: { type: Type.STRING },
        limit: { type: Type.NUMBER, description: "Max rows to return, default 50, max 200" },
      },
    },
  },
];

async function get_stats() {
  // isReturned + gst.totalInvoiceValue both live on GstRecord alone, no join needed.
  const [orderAgg] = await GstRecord.aggregate([
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalReturned: { $sum: { $cond: ["$isReturned", 1, 0] } },
        totalRevenue: { $sum: "$gst.totalInvoiceValue" },
      },
    },
  ]);
  const [customerAgg] = await Customer.aggregate([
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        repeatCustomers: { $sum: { $cond: ["$isRepeat", 1, 0] } },
      },
    },
  ]);

  const totalOrders = orderAgg?.totalOrders ?? 0;
  const totalReturned = orderAgg?.totalReturned ?? 0;
  return {
    totalOrders,
    totalReturned,
    returnRate: totalOrders ? totalReturned / totalOrders : 0,
    totalRevenue: orderAgg?.totalRevenue ?? 0,
    totalCustomers: customerAgg?.totalCustomers ?? 0,
    repeatCustomers: customerAgg?.repeatCustomers ?? 0,
  };
}

async function search_orders({ dateFrom, dateTo, customerName, sku, state, returned, limit } = {}) {
  const filter = {};
  if (dateFrom || dateTo) {
    filter["gst.orderDate"] = {};
    if (dateFrom) filter["gst.orderDate"].$gte = new Date(dateFrom);
    if (dateTo) filter["gst.orderDate"].$lte = new Date(dateTo);
  }
  if (customerName) filter["label.customerName"] = new RegExp(escapeRegex(customerName), "i");
  if (sku) filter["label.sku"] = new RegExp(escapeRegex(sku), "i");
  if (state) filter["gst.endCustomerStateNew"] = new RegExp(`^${escapeRegex(state)}$`, "i");
  if (typeof returned === "boolean") filter.isReturned = returned;

  const cappedLimit = Math.min(200, Number(limit) || 50);
  const orders = await GstRecord.aggregate([
    ...mergedOrderPipelineStages(),
    { $match: filter },
    { $sort: { "gst.orderDate": -1 } },
    { $limit: cappedLimit },
  ]);
  return { count: orders.length, orders };
}

async function search_customers({ scamTag, isRepeat, pincode, limit } = {}) {
  const filter = {};
  if (scamTag) filter.scamTag = scamTag;
  if (typeof isRepeat === "boolean") filter.isRepeat = isRepeat;
  if (pincode) filter.pincode = pincode;

  const cappedLimit = Math.min(200, Number(limit) || 50);
  const customers = await Customer.find(filter).sort({ totalOrders: -1 }).limit(cappedLimit).lean();
  return { count: customers.length, customers };
}

export const toolImpls = { get_stats, search_orders, search_customers };

export function isKnownTool(tool) {
  return Object.prototype.hasOwnProperty.call(toolImpls, tool);
}

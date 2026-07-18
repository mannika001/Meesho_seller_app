import { Router } from "express";
import GstRecord from "../models/GstRecord.js";
import { mergedOrderPipelineStages } from "../services/orderAssembly.js";

const router = Router();

// Grouped by catalog id (the stable product identifier from the Orders
// export or the Order Summary/payments export), falling back to label SKU
// for orders uploaded without either. Aggregates only what's actually in
// the uploaded files — invoice value and GST tax amount from the GST
// report, listed/discounted price from the Orders export, and order
// value/payout value from the Order Summary export (the only file that
// carries actual bank settlement per order). totalOrderValue minus
// totalPayoutValue approximates Meesho's commission + fees + return losses
// combined — it isn't a clean commission-only figure, just what actually
// disappears between listed price and what lands in the bank.
router.get("/", async (req, res) => {
  const products = await GstRecord.aggregate([
    ...mergedOrderPipelineStages(),
    {
      $addFields: {
        groupKey: {
          $ifNull: ["$orderInfo.catalogId", { $ifNull: ["$payout.catalogId", "$label.sku"] }],
        },
      },
    },
    { $match: { groupKey: { $ne: null } } },
    {
      $group: {
        _id: "$groupKey",
        productName: { $last: "$orderInfo.productName" },
        sku: { $last: "$label.sku" },
        totalOrders: { $sum: 1 },
        totalQuantity: { $sum: { $ifNull: ["$gst.quantity", 0] } },
        totalTaxableValue: { $sum: { $ifNull: ["$gst.totalTaxableSaleValue", 0] } },
        totalTaxAmount: { $sum: { $ifNull: ["$gst.taxAmount", 0] } },
        totalInvoiceValue: { $sum: { $ifNull: ["$gst.totalInvoiceValue", 0] } },
        totalListedPrice: { $sum: { $ifNull: ["$orderInfo.supplierListedPrice", 0] } },
        totalDiscountedPrice: { $sum: { $ifNull: ["$orderInfo.supplierDiscountedPrice", 0] } },
        totalOrderValue: { $sum: { $ifNull: ["$payout.price", 0] } },
        totalPayoutValue: { $sum: { $ifNull: ["$payout.payoutValue", 0] } },
      },
    },
    { $sort: { totalInvoiceValue: -1 } },
    {
      $project: {
        _id: 0,
        catalogId: "$_id",
        productName: 1,
        sku: 1,
        totalOrders: 1,
        totalQuantity: 1,
        totalTaxableValue: 1,
        totalTaxAmount: 1,
        totalInvoiceValue: 1,
        totalListedPrice: 1,
        totalDiscountedPrice: 1,
        totalOrderValue: 1,
        totalPayoutValue: 1,
      },
    },
  ]);
  res.json({ ok: true, products });
});

export default router;

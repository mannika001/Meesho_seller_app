import mongoose from "mongoose";

const orderInfoSchema = new mongoose.Schema(
  {
    orderStatus: String,
    catalogId: String,
    orderSource: String,
    productName: String,
    packetId: String,
    supplierListedPrice: Number,
    supplierDiscountedPrice: Number,
  },
  { _id: false }
);

const orderInfoRecordSchema = new mongoose.Schema(
  {
    subOrderNum: { type: String, required: true, unique: true, index: true },
    orderInfo: orderInfoSchema,
    sourceBatchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadBatch" }],
  },
  { timestamps: true }
);

export default mongoose.model("OrderInfo", orderInfoRecordSchema, "orderinfos");

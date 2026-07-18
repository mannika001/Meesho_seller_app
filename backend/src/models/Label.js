import mongoose from "mongoose";

const labelSchema = new mongoose.Schema(
  {
    customerName: String,
    customerNameNormalized: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
    courierName: String,
    awb: String,
    sku: String,
    size: String,
    color: String,
    qty: Number,
  },
  { _id: false }
);

const labelRecordSchema = new mongoose.Schema(
  {
    subOrderNum: { type: String, required: true, unique: true, index: true },
    label: labelSchema,
    customerKey: { type: String, index: true },
    sourceBatchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadBatch" }],
  },
  { timestamps: true }
);

export default mongoose.model("Label", labelRecordSchema, "labels");

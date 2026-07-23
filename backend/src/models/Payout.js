import mongoose from "mongoose";

const payoutSchema = new mongoose.Schema(
  {
    catalogId: String,
    quantity: Number,
    price: Number,
    orderDate: Date,
    orderStatus: String,
    payoutValue: Number,
    payoutStatus: String,
  },
  { _id: false }
);

const payoutRecordSchema = new mongoose.Schema(
  {
    subOrderNum: { type: String, required: true, unique: true, index: true },
    payout: payoutSchema,
    sourceBatchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadBatch" }],
  },
  { timestamps: true }
);

export default mongoose.model("Payout", payoutRecordSchema, "payouts");

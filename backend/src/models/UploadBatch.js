import mongoose from "mongoose";

const uploadBatchSchema = new mongoose.Schema(
  {
    uploadedAt: { type: Date, default: Date.now },
    zipFileName: String,
    labelFileNames: [String],
    ordersCsvFileName: String,
    orderSummaryCsvFileName: String,
    orderSummaryCsvHash: String,
    monthNumber: Number,
    financialYear: String,
    earliestOrderDate: Date,
    latestOrderDate: Date,
    salesRowsParsed: { type: Number, default: 0 },
    returnRowsParsed: { type: Number, default: 0 },
    labelPagesParsed: { type: Number, default: 0 },
    orderInfoRowsParsed: { type: Number, default: 0 },
    payoutRowsParsed: { type: Number, default: 0 },
    ordersUpserted: { type: Number, default: 0 },
    ordersUpdated: { type: Number, default: 0 },
    ordersUnmatchedLabel: { type: Number, default: 0 },
    warnings: [String],
    status: { type: String, enum: ["completed", "failed"], default: "completed" },
    errorMessage: String,
  },
  { timestamps: true }
);

export default mongoose.model("UploadBatch", uploadBatchSchema);

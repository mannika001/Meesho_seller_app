import mongoose from "mongoose";

const gstSchema = new mongoose.Schema(
  {
    supName: String,
    gstin: String,
    orderDate: Date,
    hsnCode: String,
    quantity: Number,
    gstRate: Number,
    totalTaxableSaleValue: Number,
    taxAmount: Number,
    totalInvoiceValue: Number,
    taxableShipping: Number,
    endCustomerStateNew: String,
    enrollmentNo: String,
    manifestDate: Date,
    transactionType: String,
    ecoTcsGstin: String,
    financialYear: String,
    monthNumber: Number,
    supplierId: String,
  },
  { _id: false }
);

const returnInfoSchema = new mongoose.Schema(
  {
    cancelReturnDate: Date,
  },
  { _id: false }
);

const gstRecordSchema = new mongoose.Schema(
  {
    subOrderNum: { type: String, required: true, unique: true, index: true },
    gst: gstSchema,
    returnInfo: returnInfoSchema,
    isReturned: { type: Boolean, default: false },
    sourceBatchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadBatch" }],
  },
  { timestamps: true }
);

export default mongoose.model("GstRecord", gstRecordSchema, "gstrecords");

import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerKey: { type: String, required: true, unique: true, index: true },
    displayName: String,
    address: String,
    state: String,
    pincode: String,
    totalOrders: { type: Number, default: 0 },
    returnedOrders: { type: Number, default: 0 },
    returnRate: { type: Number, default: 0 },
    isRepeat: { type: Boolean, default: false },
    scamTag: {
      type: String,
      enum: ["none", "little_scammy", "total_scammy", "not_enough_data"],
      default: "not_enough_data",
    },
    subOrderNums: [String],
  },
  { timestamps: true }
);

export default mongoose.model("Customer", customerSchema);

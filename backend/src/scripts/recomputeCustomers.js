import mongoose from "mongoose";
import { connectDb } from "../db/connect.js";
import { recomputeAllCustomers } from "../services/customerProfile.js";

await connectDb();
const { customersComputed } = await recomputeAllCustomers();
console.log(`Recomputed ${customersComputed} customers`);
await mongoose.disconnect();

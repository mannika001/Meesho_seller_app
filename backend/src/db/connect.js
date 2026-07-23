import dns from "node:dns";
import mongoose from "mongoose";
import { config } from "../config.js";

// This machine's system DNS server doesn't answer SRV/A queries (seen locally
// as ECONNREFUSED on querySrv for the mongodb+srv:// lookup, and even
// google.com fails to resolve) — point this process's resolver at a public
// DNS server instead of relying on the OS network config, since fixing that
// needs admin rights we don't have here.
dns.setServers(["1.1.1.1", "8.8.8.8"]);

export async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongodbUri);
  console.log(`[db] connected to ${config.mongodbUri}`);
}

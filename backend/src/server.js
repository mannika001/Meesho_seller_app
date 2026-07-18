import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { connectDb } from "./db/connect.js";
import uploadRouter from "./routes/upload.js";
import ordersRouter from "./routes/orders.js";
import customersRouter from "./routes/customers.js";
import productsRouter from "./routes/products.js";
import chatRouter from "./routes/chat.js";

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/upload", uploadRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/customers", customersRouter);
app.use("/api/products", productsRouter);
app.use("/api/chat", chatRouter);

connectDb()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`[server] listening on http://localhost:${config.port}`);
    });
  })
  .catch((err) => {
    console.error("[server] failed to connect to MongoDB", err);
    process.exit(1);
  });

import { Router } from "express";
import multer from "multer";
import { runUploadPipeline } from "../services/uploadPipeline.js";
import UploadBatch from "../models/UploadBatch.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post(
  "/",
  upload.fields([
    { name: "zip", maxCount: 1 },
    { name: "labels", maxCount: 50 },
    { name: "ordersCsv", maxCount: 1 },
    { name: "orderSummaryCsv", maxCount: 1 },
  ]),
  async (req, res) => {
    const zipFile = req.files?.zip?.[0];
    const labelFiles = req.files?.labels || [];
    const ordersCsvFile = req.files?.ordersCsv?.[0];
    const orderSummaryCsvFile = req.files?.orderSummaryCsv?.[0];
    if (!zipFile && labelFiles.length === 0 && !ordersCsvFile && !orderSummaryCsvFile) {
      return res
        .status(400)
        .json({ ok: false, message: "Upload a zip, label PDFs, an orders CSV, and/or an order summary CSV" });
    }
    try {
      const result = await runUploadPipeline({
        zipBuffer: zipFile?.buffer,
        zipFileName: zipFile?.originalname,
        labelFiles,
        ordersCsvBuffer: ordersCsvFile?.buffer,
        ordersCsvFileName: ordersCsvFile?.originalname,
        orderSummaryCsvBuffer: orderSummaryCsvFile?.buffer,
        orderSummaryCsvFileName: orderSummaryCsvFile?.originalname,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[upload] error", err);
      res.status(500).json({ ok: false, message: err.message });
    }
  }
);

router.get("/batches", async (req, res) => {
  const batches = await UploadBatch.find().sort({ createdAt: -1 }).limit(50).lean();
  res.json({ ok: true, batches });
});

export default router;

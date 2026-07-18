import AdmZip from "adm-zip";
import { createHash } from "crypto";
import GstRecord from "../models/GstRecord.js";
import Label from "../models/Label.js";
import OrderInfo from "../models/OrderInfo.js";
import Payout from "../models/Payout.js";
import UploadBatch from "../models/UploadBatch.js";
import { parseTcsSheet } from "../parsers/excelParser.js";
import { parseLabelPdf } from "../parsers/labelPdfParser.js";
import { parseOrdersCsv } from "../parsers/ordersCsvParser.js";
import { parseOrderSummaryCsv } from "../parsers/orderSummaryCsvParser.js";
import { customerKey } from "../utils/customerKey.js";
import { recomputeAllCustomers } from "./customerProfile.js";

function findZipEntry(zip, fileName) {
  return zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(fileName));
}

// Batch-level date range, from whichever of this batch's own files carried
// an order date (GST sheet rows, Order Summary rows, and/or Orders Excel
// rows) — not scoped to the GST-report-only monthNumber/financialYear, so a
// batch with only one of those files still shows a meaningful month instead
// of "-".
function collectOrderDateRange(...rowArrays) {
  const dates = rowArrays.flat().map((r) => r.orderDate).filter(Boolean);
  if (dates.length === 0) return { earliest: null, latest: null };
  return {
    earliest: new Date(Math.min(...dates.map((d) => d.getTime()))),
    latest: new Date(Math.max(...dates.map((d) => d.getTime()))),
  };
}

export async function runUploadPipeline({
  zipBuffer,
  zipFileName,
  labelFiles = [],
  ordersCsvBuffer,
  ordersCsvFileName,
  orderSummaryCsvBuffer,
  orderSummaryCsvFileName,
}) {
  const warnings = [];

  // Skip label PDFs already uploaded in a prior completed batch (by filename) so
  // re-uploads don't reprocess data or inflate the labels-uploaded count.
  let newLabelFiles = labelFiles;
  if (labelFiles.length > 0) {
    const priorNames = new Set(
      (await UploadBatch.find({ status: "completed" }).select("labelFileNames").lean()).flatMap(
        (b) => b.labelFileNames
      )
    );
    newLabelFiles = labelFiles.filter((f) => !priorNames.has(f.originalname));
    labelFiles
      .filter((f) => priorNames.has(f.originalname))
      .forEach((f) => warnings.push(`${f.originalname}: already uploaded previously, skipped`));
  }

  // Skip the Order Summary file if its content exactly matches a prior
  // completed upload — filename alone isn't reliable here since Meesho's
  // export often reuses the same generic filename across different months.
  let orderSummaryCsvHash = null;
  if (orderSummaryCsvBuffer) {
    orderSummaryCsvHash = createHash("sha256").update(orderSummaryCsvBuffer).digest("hex");
    const duplicate = await UploadBatch.findOne({ status: "completed", orderSummaryCsvHash }).lean();
    if (duplicate) {
      warnings.push(
        `${orderSummaryCsvFileName || "Order Summary file"}: identical to a file already uploaded on ${new Date(
          duplicate.uploadedAt
        ).toLocaleDateString()}, skipped`
      );
      orderSummaryCsvBuffer = null;
      orderSummaryCsvHash = null;
    }
  }

  const batch = await UploadBatch.create({
    zipFileName: zipFileName || null,
    labelFileNames: newLabelFiles.map((f) => f.originalname),
    ordersCsvFileName: ordersCsvFileName || null,
    orderSummaryCsvFileName: orderSummaryCsvBuffer ? orderSummaryCsvFileName || null : null,
    orderSummaryCsvHash,
  });

  try {
    // 1. Unzip + parse the GST TCS excel reports
    let salesRows = [];
    let returnRows = [];
    if (zipBuffer) {
      const zip = new AdmZip(zipBuffer);
      const salesEntry = findZipEntry(zip, "tcs_sales.xlsx");
      const returnEntry = findZipEntry(zip, "tcs_sales_return.xlsx");
      if (!salesEntry && !returnEntry) {
        throw new Error("zip did not contain tcs_sales.xlsx or tcs_sales_return.xlsx");
      }
      if (salesEntry) salesRows = await parseTcsSheet(salesEntry.getData());
      if (returnEntry) returnRows = await parseTcsSheet(returnEntry.getData());
    }

    // 2. Parse label PDFs (one bad page shouldn't kill the batch)
    const labelRecords = [];
    for (const file of newLabelFiles) {
      const { records, warnings: pdfWarnings } = await parseLabelPdf(file.buffer);
      labelRecords.push(...records);
      pdfWarnings.forEach((w) => warnings.push(`${file.originalname}: ${w}`));
    }

    // 2b. Parse the Orders CSV export (product name, catalog id, status, etc.)
    const orderInfoRows = ordersCsvBuffer ? await parseOrdersCsv(ordersCsvBuffer) : [];

    // 2c. Parse the Order Summary / payments export (price, payout value, payout status)
    const payoutRows = orderSummaryCsvBuffer ? await parseOrderSummaryCsv(orderSummaryCsvBuffer) : [];

    // 3. Merge by subOrderNum, per source collection. GST sales + returns
    // still merge together (same zip, same destination collection); orderInfo
    // and payout each get their own map since they now write to their own
    // collections instead of sharing one Order doc.
    const gstMap = new Map(); // subOrderNum -> { gst, returnInfo? }
    for (const row of salesRows) {
      const { subOrderNum, ...gst } = row;
      const existing = gstMap.get(subOrderNum) || {};
      gstMap.set(subOrderNum, { ...existing, gst: { ...existing.gst, ...gst } });
    }
    for (const row of returnRows) {
      const { subOrderNum, cancelReturnDate, ...gst } = row;
      const existing = gstMap.get(subOrderNum) || {};
      gstMap.set(subOrderNum, {
        ...existing,
        gst: { ...existing.gst, ...gst },
        returnInfo: { cancelReturnDate },
      });
    }

    const orderInfoMap = new Map();
    for (const row of orderInfoRows) {
      // orderDate is only used below for the batch-level date range — the
      // order itself already has gst.orderDate, so don't duplicate storage.
      const { subOrderNum, orderDate, ...orderInfo } = row;
      const existing = orderInfoMap.get(subOrderNum) || {};
      orderInfoMap.set(subOrderNum, { ...existing, ...orderInfo });
    }

    const payoutMap = new Map();
    for (const row of payoutRows) {
      const { subOrderNum, ...payout } = row;
      const existing = payoutMap.get(subOrderNum) || {};
      payoutMap.set(subOrderNum, { ...existing, ...payout });
    }

    const labelMap = new Map();
    let ordersUnmatchedLabel = 0;
    for (const rec of labelRecords) {
      const { subOrderNum, customerName, ...rest } = rec;
      labelMap.set(subOrderNum, {
        customerName,
        customerNameNormalized: (customerName || "").toLowerCase().trim(),
        ...rest,
      });
      if (!gstMap.has(subOrderNum) && !orderInfoMap.has(subOrderNum) && !payoutMap.has(subOrderNum)) {
        ordersUnmatchedLabel += 1;
      }
    }

    const allSubOrderNums = [
      ...new Set([...gstMap.keys(), ...orderInfoMap.keys(), ...payoutMap.keys(), ...labelMap.keys()]),
    ].filter(Boolean);

    // One upfront query per collection beats an existence check per row.
    const [existingGst, existingLabel, existingOrderInfo, existingPayout] = await Promise.all([
      GstRecord.find({ subOrderNum: { $in: allSubOrderNums } }).select("subOrderNum").lean(),
      Label.find({ subOrderNum: { $in: allSubOrderNums } }).select("subOrderNum").lean(),
      OrderInfo.find({ subOrderNum: { $in: allSubOrderNums } }).select("subOrderNum").lean(),
      Payout.find({ subOrderNum: { $in: allSubOrderNums } }).select("subOrderNum").lean(),
    ]);
    const existingSet = new Set(
      [...existingGst, ...existingLabel, ...existingOrderInfo, ...existingPayout].map((d) => d.subOrderNum)
    );

    let ordersUpserted = 0;
    let ordersUpdated = 0;
    for (const subOrderNum of allSubOrderNums) {
      if (existingSet.has(subOrderNum)) ordersUpdated += 1;
      else ordersUpserted += 1;
    }

    const gstOps = [];
    const labelOps = [];
    const orderInfoOps = [];
    const payoutOps = [];

    for (const [subOrderNum, data] of gstMap) {
      const setFields = { subOrderNum, gst: data.gst };
      if (data.returnInfo) {
        setFields.returnInfo = data.returnInfo;
        setFields.isReturned = true;
      }
      gstOps.push({
        updateOne: {
          filter: { subOrderNum },
          update: { $set: setFields, $addToSet: { sourceBatchIds: batch._id } },
          upsert: true,
        },
      });
    }
    for (const [subOrderNum, labelData] of labelMap) {
      labelOps.push({
        updateOne: {
          filter: { subOrderNum },
          update: {
            $set: { subOrderNum, label: labelData, customerKey: customerKey(labelData.customerName, labelData.pincode) },
            $addToSet: { sourceBatchIds: batch._id },
          },
          upsert: true,
        },
      });
    }
    for (const [subOrderNum, orderInfo] of orderInfoMap) {
      orderInfoOps.push({
        updateOne: {
          filter: { subOrderNum },
          update: { $set: { subOrderNum, orderInfo }, $addToSet: { sourceBatchIds: batch._id } },
          upsert: true,
        },
      });
    }
    for (const [subOrderNum, payout] of payoutMap) {
      payoutOps.push({
        updateOne: {
          filter: { subOrderNum },
          update: { $set: { subOrderNum, payout }, $addToSet: { sourceBatchIds: batch._id } },
          upsert: true,
        },
      });
    }

    await Promise.all([
      gstOps.length ? GstRecord.bulkWrite(gstOps) : null,
      labelOps.length ? Label.bulkWrite(labelOps) : null,
      orderInfoOps.length ? OrderInfo.bulkWrite(orderInfoOps) : null,
      payoutOps.length ? Payout.bulkWrite(payoutOps) : null,
    ]);

    // 4. Recompute customer profiles (repeat/return-rate/scam-tag)
    await recomputeAllCustomers();

    const monthSource = salesRows[0] || returnRows[0];
    if (monthSource) {
      batch.monthNumber = monthSource.monthNumber;
      batch.financialYear = monthSource.financialYear;
    }

    const { earliest, latest } = collectOrderDateRange(salesRows, returnRows, payoutRows, orderInfoRows);
    if (earliest) batch.earliestOrderDate = earliest;
    if (latest) batch.latestOrderDate = latest;

    batch.salesRowsParsed = salesRows.length;
    batch.returnRowsParsed = returnRows.length;
    batch.labelPagesParsed = labelRecords.length;
    batch.orderInfoRowsParsed = orderInfoRows.length;
    batch.payoutRowsParsed = payoutRows.length;
    batch.ordersUpserted = ordersUpserted;
    batch.ordersUpdated = ordersUpdated;
    batch.ordersUnmatchedLabel = ordersUnmatchedLabel;
    batch.warnings = warnings;
    batch.status = "completed";
    await batch.save();

    return { batchId: batch._id, ordersUpserted, ordersUpdated, ordersUnmatchedLabel, warnings };
  } catch (err) {
    batch.status = "failed";
    batch.errorMessage = err.message;
    await batch.save();
    throw err;
  }
}

import { readFile } from "fs/promises";
import { parseLabelPdf } from "./labelPdfParser.js";
import { parseTcsSheet } from "./excelParser.js";

const LABEL_PATH =
  "C:\\Users\\verma\\Downloads\\tshirt\\Sub_Order_Labels_50397ad4-d8bd-42c8-ab0c-92d3730c7971.pdf";
const SALES_PATH = "C:\\Users\\verma\\AppData\\Local\\Temp\\meesho_check\\tcs_sales.xlsx";

async function main() {
  const buf = await readFile(LABEL_PATH);
  const { records, warnings, pageCount } = await parseLabelPdf(buf);

  console.log("pages:", pageCount, "records extracted:", records.length, "warnings:", warnings.length);
  if (warnings.length) console.log("warnings:", warnings);
  console.log(JSON.stringify(records, null, 2));

  // Expected ground truth from the two sample pages (verified by eye earlier).
  const expected = [
    { subOrderNum: "307863912517890368_1", customerName: "shayamprasad", pincode: "734005", awb: "SF3672376342FPL" },
    { subOrderNum: "309243944452162638_1", customerName: "Swati Patel", pincode: "482001", awb: "1490838256508554" },
  ];
  let allMatch = true;
  expected.forEach((exp) => {
    const found = records.find((r) => r.subOrderNum === exp.subOrderNum);
    const ok =
      found &&
      found.customerName === exp.customerName &&
      found.pincode === exp.pincode &&
      found.awb === exp.awb;
    console.log(ok ? "PASS" : "FAIL", exp.subOrderNum, found);
    if (!ok) allMatch = false;
  });

  // Cross-check against the Excel sample: these sub_order_nums should also
  // appear in tcs_sales.xlsx if they're real June orders.
  const salesBuf = await readFile(SALES_PATH);
  const salesRows = await parseTcsSheet(salesBuf);
  const salesSubOrderNums = new Set(salesRows.map((r) => r.subOrderNum));
  records.forEach((r) => {
    const inSales = salesSubOrderNums.has(r.subOrderNum);
    console.log(inSales ? "JOIN OK" : "JOIN MISS (may be a different month)", r.subOrderNum);
  });

  console.log(allMatch ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { readFile } from "fs/promises";
import { parseTcsSheet } from "./excelParser.js";

const SALES_PATH = "C:\\Users\\verma\\AppData\\Local\\Temp\\meesho_check\\tcs_sales.xlsx";
const RETURN_PATH = "C:\\Users\\verma\\AppData\\Local\\Temp\\meesho_check\\tcs_sales_return.xlsx";

async function main() {
  const salesBuf = await readFile(SALES_PATH);
  const returnBuf = await readFile(RETURN_PATH);

  const salesRows = await parseTcsSheet(salesBuf);
  const returnRows = await parseTcsSheet(returnBuf);

  console.log("sales rows parsed:", salesRows.length, "(expected 333 data rows — sheet had 334 <row> tags incl. header)");
  console.log("return rows parsed:", returnRows.length, "(expected 105 data rows — sheet had 106 <row> tags incl. header)");
  console.log("\nsample sales row:", JSON.stringify(salesRows[0], null, 2));
  console.log("\nsample return row (should include cancelReturnDate):", JSON.stringify(returnRows[0], null, 2));

  const missingSubOrder = salesRows.filter((r) => !r.subOrderNum).length;
  console.log("\nsales rows missing subOrderNum:", missingSubOrder);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

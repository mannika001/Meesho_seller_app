import assert from "node:assert";
import ExcelJS from "exceljs";
import { parseTcsSheet } from "./excelParser.js";

async function demo() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("sheet1");
  ws.addRow(["sub_order_num", "tax_amount", "total_invoice_value"]);
  ws.addRow(["299891276865084928_1", 130200, 248]); // known bad row, must be excluded
  ws.addRow(["300598398712028672_1", 114975, 219]); // known bad row, must be excluded
  ws.addRow(["300000000000000000_1", 12, 100]); // normal row, must survive

  const buffer = await wb.xlsx.writeBuffer();
  const rows = await parseTcsSheet(buffer);

  assert.strictEqual(rows.length, 1, `expected 1 surviving row, got ${rows.length}`);
  assert.strictEqual(rows[0].subOrderNum, "300000000000000000_1");

  console.log("excelParser self-check passed");
}

demo();

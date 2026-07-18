import ExcelJS from "exceljs";
import { Readable } from "stream";

// Meesho's "Order Summary" / payments export -> canonical field names.
// sub_order_num is the join key (pulled out separately by the pipeline).
// This is the only export that carries Payout Value (actual bank
// settlement per order), so it's what makes commission/settlement math
// possible; catalog id/quantity/price are kept here too so unit economics
// work even if this is the only file uploaded for a given month.
const COLUMN_MAP = {
  "sub orderid": "subOrderNum",
  "catalog id": "catalogId",
  "quantity": "quantity",
  "price": "price",
  "order date": "orderDate",
  "payout value": "payoutValue",
  "payout status": "payoutStatus",
};

const NUMBER_FIELDS = new Set(["quantity", "price", "payoutValue"]);
const DATE_FIELDS = new Set(["orderDate"]);

export async function parseOrderSummaryCsv(buffer) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = await workbook.csv.read(Readable.from(buffer));

  const headerRow = worksheet.getRow(1);
  const headerIndex = {}; // colNumber -> canonical field name
  headerRow.eachCell((cell, colNumber) => {
    const raw = String(cell.value ?? "").trim().toLowerCase();
    const canonical = COLUMN_MAP[raw];
    if (canonical) headerIndex[colNumber] = canonical;
  });

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    row.eachCell((cell, colNumber) => {
      const field = headerIndex[colNumber];
      if (!field) return;
      const text = String(cell.value ?? "").trim();
      if (!text) return;
      if (NUMBER_FIELDS.has(field)) {
        obj[field] = Number(text);
      } else if (DATE_FIELDS.has(field)) {
        const d = new Date(text);
        if (!isNaN(d.getTime())) obj[field] = d;
      } else {
        obj[field] = text;
      }
    });
    if (obj.subOrderNum) rows.push(obj);
  });

  return rows;
}

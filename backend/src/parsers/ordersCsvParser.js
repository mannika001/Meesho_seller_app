import ExcelJS from "exceljs";
import { Readable } from "stream";

// Meesho's "Orders" export (order-level CSV, not the GST TCS report) ->
// canonical field names. sub_order_num is the join key (pulled out
// separately by the pipeline); order_date/customer_state/sku/size/quantity
// overlap with the GST sheet and label PDF and are intentionally not
// re-parsed here, only the fields this export uniquely provides.
const COLUMN_MAP = {
  "sub order no": "subOrderNum",
  "reason for credit entry": "orderStatus",
  "catalog id": "catalogId",
  "order source": "orderSource",
  "product name": "productName",
  "packet id": "packetId",
  "supplier listed price (incl. gst + commission)": "supplierListedPrice",
  "supplier discounted price (incl gst and commision)": "supplierDiscountedPrice",
  // Parsed only for batch-level date range display (e.g. when Orders Excel
  // is uploaded standalone, with no GST/Order Summary file in the same
  // batch to derive a month from) — not stored on the order itself, since
  // gst.orderDate is the source of truth there.
  "order date": "orderDate",
};

const NUMBER_FIELDS = new Set(["supplierListedPrice", "supplierDiscountedPrice"]);
const DATE_FIELDS = new Set(["orderDate"]);

export async function parseOrdersCsv(buffer) {
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

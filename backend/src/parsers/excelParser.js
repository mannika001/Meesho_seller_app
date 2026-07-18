import ExcelJS from "exceljs";

// Meesho's GST TCS report headers -> canonical field names.
// sub_order_num is the join key (pulled out separately by the pipeline);
// everything else lands under Order.gst / Order.returnInfo.
const COLUMN_MAP = {
  sub_order_num: "subOrderNum",
  sup_name: "supName",
  gstin: "gstin",
  order_date: "orderDate",
  hsn_code: "hsnCode",
  quantity: "quantity",
  gst_rate: "gstRate",
  total_taxable_sale_value: "totalTaxableSaleValue",
  tax_amount: "taxAmount",
  total_invoice_value: "totalInvoiceValue",
  taxable_shipping: "taxableShipping",
  end_customer_state_new: "endCustomerStateNew",
  enrollment_no: "enrollmentNo",
  cancel_return_date: "cancelReturnDate", // only present in the returns sheet
  manifest_date: "manifestDate",
  transaction_type: "transactionType",
  eco_tcs_gstin: "ecoTcsGstin",
  financial_year: "financialYear",
  month_number: "monthNumber",
  supplier_id: "supplierId",
};

const NUMBER_FIELDS = new Set([
  "quantity",
  "gstRate",
  "totalTaxableSaleValue",
  "taxAmount",
  "totalInvoiceValue",
  "taxableShipping",
  "monthNumber",
]);

const DATE_FIELDS = new Set(["orderDate", "manifestDate", "cancelReturnDate"]);

function cellText(cellValue) {
  if (cellValue === null || cellValue === undefined) return "";
  if (typeof cellValue === "object" && "result" in cellValue) return String(cellValue.result ?? "");
  if (typeof cellValue === "object" && "richText" in cellValue) {
    return cellValue.richText.map((r) => r.text).join("");
  }
  return String(cellValue);
}

// Shared parser for both tcs_sales.xlsx and tcs_sales_return.xlsx — column
// presence/order isn't hardcoded, it's detected from row 1 headers, so the
// same function handles the returns sheet's extra cancel_return_date column
// without needing a flag.
export async function parseTcsSheet(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headerRow = worksheet.getRow(1);
  const headerIndex = {}; // colNumber -> canonical field name
  headerRow.eachCell((cell, colNumber) => {
    const raw = cellText(cell.value).trim();
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
      const text = cellText(cell.value).trim();
      if (!text) return;
      if (NUMBER_FIELDS.has(field)) {
        obj[field] = Number(text);
      } else if (DATE_FIELDS.has(field)) {
        // Some rows (e.g. adjustment/reversal lines) have the literal text
        // "null" instead of a real date or an empty cell — drop it rather
        // than storing an Invalid Date.
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

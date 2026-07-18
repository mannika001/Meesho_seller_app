import pdfParse from "pdf-parse/lib/pdf-parse.js";

// Matches Meesho's "City, State, 6-digit-pincode" address line, e.g.
// "Siliguri, West Bengal, 734005".
const PINCODE_LINE_RE = /^(.+?),\s*([A-Za-z .]+),\s*(\d{6})\s*$/;

// One page = one shipping label + tax invoice. Text items come back in
// reading order from pdf-parse's pagerender hook, so each field is found by
// anchoring on a known label ("Customer Address", "Pickup", "Order No.")
// rather than fixed positions — layout shifts (e.g. COD vs prepaid banner
// text) don't move these anchors.
// ponytail: assumes exactly one product row per label (matches both sample
// pages) — multi-item orders on one label aren't handled in v1.
function extractPage(items, pageNumber) {
  const t = items.map((s) => s.trim());

  const addrStart = t.findIndex((s) => s.startsWith("Customer Address"));
  const addrEnd = t.findIndex((s) => s.startsWith("If undelivered"));
  const orderNoHeaderIdx = t.findIndex((s) => s === "Order No.");

  if (addrStart === -1 || addrEnd === -1 || orderNoHeaderIdx === -1) {
    throw new Error(`page ${pageNumber}: could not locate expected label sections`);
  }

  const addressLines = t.slice(addrStart + 1, addrEnd).filter(Boolean);
  if (addressLines.length < 2) {
    throw new Error(`page ${pageNumber}: address block too short`);
  }
  const customerName = addressLines[0];
  const cityStatePin = addressLines[addressLines.length - 1];
  const pinMatch = cityStatePin.match(PINCODE_LINE_RE);
  if (!pinMatch) {
    throw new Error(`page ${pageNumber}: could not parse city/state/pincode from "${cityStatePin}"`);
  }
  const [, city, state, pincode] = pinMatch;
  const address = addressLines.slice(1, -1).join(", ");

  // Courier name sits directly above the "Pickup" chip in the label box.
  const pickupIdx = t.findIndex((s) => s.toLowerCase() === "pickup");
  let courierName = "";
  for (let i = pickupIdx - 1; i >= 0; i--) {
    if (t[i]) {
      courierName = t[i];
      break;
    }
  }

  // AWB/tracking number is the item right before the "Product Details" block.
  const detailsIdx = t.findIndex((s) => s === "Product Details");
  const awb = detailsIdx > 0 ? t[detailsIdx - 1] : "";

  // Header row is SKU, Size, Qty, Color, "Order No." (5 cells); the data
  // row is the next 5 cells in the same order.
  const [sku, size, qtyRaw, color, orderNo] = t.slice(orderNoHeaderIdx + 1, orderNoHeaderIdx + 6);
  if (!orderNo) {
    throw new Error(`page ${pageNumber}: could not locate Order No. value`);
  }

  return {
    subOrderNum: orderNo,
    customerName,
    address,
    city,
    state,
    pincode,
    courierName,
    awb,
    sku,
    size,
    color,
    qty: Number(qtyRaw) || undefined,
  };
}

export async function parseLabelPdf(buffer) {
  const pagesItems = [];
  await pdfParse(buffer, {
    pagerender: (pageData) =>
      pageData.getTextContent().then((textContent) => {
        const items = textContent.items.map((item) => item.str);
        pagesItems.push(items);
        return items.join(" ");
      }),
  });

  const records = [];
  const warnings = [];
  pagesItems.forEach((items, i) => {
    try {
      records.push(extractPage(items, i + 1));
    } catch (err) {
      warnings.push(err.message);
    }
  });

  return { records, warnings, pageCount: pagesItems.length };
}

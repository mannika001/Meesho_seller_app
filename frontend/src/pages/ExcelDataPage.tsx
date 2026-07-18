import { useEffect, useMemo, useState } from "react";
import { getOrders, getOrderStats, type Order, type OrderStats } from "../api";
import { TAG_LABEL, TAG_CLASS } from "../components/CustomerTable";
import OrderBreakdownModal from "../components/OrderBreakdownModal";
import { useLanguage } from "../LanguageContext";
import { bilingual } from "../i18n";

type View = "sales" | "returns" | "rto";

const PAGE_SIZE = 20;

function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString() : "-";
}

function fmtMoney(n?: number) {
  return typeof n === "number" ? `Rs.${n.toFixed(2)}` : "-";
}

function fmtMonth(d: string | null) {
  return d ? new Date(d).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;
}

type ColDef = {
  key: string;
  label: string;
  numeric?: boolean;
  mono?: boolean;
  help?: string;
  showIf?: (view: View) => boolean;
  selectOptions?: string[]; // present -> filter row renders a dropdown instead of free text
  text: (o: Order) => string; // plain text, used for both filtering and default display
  render?: (o: Order) => React.ReactNode; // overrides display only (e.g. colored tags, view hint)
};

// Everyday columns — visible by default, plain-language labels.
const CORE_COLUMNS: ColDef[] = [
  {
    key: "subOrderNum",
    label: "Order ID",
    mono: true,
    text: (o) => o.subOrderNum,
    render: (o) => (
      <>
        {o.subOrderNum}
        <span className="row-view-hint">View breakdown →</span>
      </>
    ),
  },
  { key: "productName", label: "Product name", text: (o) => o.orderInfo?.productName || "-" },
  { key: "customerName", label: "Customer", text: (o) => o.label?.customerName || "-" },
  { key: "pincode", label: "Pincode", mono: true, text: (o) => o.label?.pincode || "-" },
  { key: "sku", label: "SKU", mono: true, text: (o) => o.label?.sku || "-" },
  { key: "orderDate", label: "Order date", text: (o) => fmtDate(o.gst?.orderDate) },
  {
    key: "cancelReturnDate",
    label: "Return date",
    showIf: (v) => v === "returns",
    text: (o) => fmtDate(o.returnInfo?.cancelReturnDate),
  },
  { key: "qty", label: "Qty", numeric: true, text: (o) => String(o.gst?.quantity ?? "-") },
  { key: "orderAmount", label: "Order amount", numeric: true, text: (o) => fmtMoney(o.payout?.price) },
  {
    key: "commission",
    label: "Kept by Meesho",
    numeric: true,
    help: "Order amount minus what you got paid — commission, fees, and return losses combined",
    text: (o) =>
      o.payout?.price != null && o.payout?.payoutValue != null
        ? fmtMoney(o.payout.price - o.payout.payoutValue)
        : "-",
  },
  {
    key: "settledAmount",
    label: "What you got paid",
    numeric: true,
    text: (o) => fmtMoney(o.payout?.payoutValue),
  },
  { key: "orderStatus", label: "Order status", text: (o) => o.orderInfo?.orderStatus || "-" },
  {
    key: "repeat",
    label: "Repeat buyer?",
    selectOptions: ["Yes", "No"],
    text: (o) => (o.customer ? (o.customer.isRepeat ? "Yes" : "No") : "-"),
  },
  {
    key: "scamTag",
    label: "Risk",
    selectOptions: Object.values(TAG_LABEL),
    text: (o) => (o.customer ? TAG_LABEL[o.customer.scamTag] : "-"),
    render: (o) =>
      o.customer ? (
        <span className={`tag ${TAG_CLASS[o.customer.scamTag]}`}>{TAG_LABEL[o.customer.scamTag]}</span>
      ) : (
        "-"
      ),
  },
];

// Accounting/tax-filing columns — opt-in via "+ Add column", not needed day to day.
const EXTRA_COLUMNS: ColDef[] = [
  { key: "hsnCode", label: "HSN code", mono: true, text: (o) => o.gst?.hsnCode || "-" },
  { key: "gstRate", label: "GST rate", numeric: true, text: (o) => (o.gst?.gstRate != null ? `${o.gst.gstRate.toFixed(2)}%` : "-") },
  { key: "taxableValue", label: "Taxable value", numeric: true, text: (o) => fmtMoney(o.gst?.totalTaxableSaleValue) },
  { key: "taxAmount", label: "Tax amount", numeric: true, text: (o) => fmtMoney(o.gst?.taxAmount) },
  { key: "invoiceValue", label: "Invoice value", numeric: true, text: (o) => fmtMoney(o.gst?.totalInvoiceValue) },
  { key: "payoutStatus", label: "Payout status", text: (o) => o.payout?.payoutStatus || "-" },
  { key: "state", label: "State", text: (o) => o.gst?.endCustomerStateNew || "-" },
  { key: "txnType", label: "Txn type", text: (o) => o.gst?.transactionType || "-" },
  { key: "returnRate", label: "Customer return rate", numeric: true, text: (o) => (o.customer ? `${(o.customer.returnRate * 100).toFixed(0)}%` : "-") },
  { key: "address", label: "Address", text: (o) => o.label?.address || "-" },
  { key: "city", label: "City", text: (o) => o.label?.city || "-" },
  { key: "courierName", label: "Courier", text: (o) => o.label?.courierName || "-" },
  { key: "awb", label: "AWB", text: (o) => o.label?.awb || "-" },
  { key: "size", label: "Size", text: (o) => o.label?.size || "-" },
  { key: "color", label: "Color", text: (o) => o.label?.color || "-" },
  { key: "catalogId", label: "Catalog ID", text: (o) => o.orderInfo?.catalogId || "-" },
  { key: "orderSource", label: "Order source", text: (o) => o.orderInfo?.orderSource || "-" },
  { key: "packetId", label: "Packet ID", text: (o) => o.orderInfo?.packetId || "-" },
  { key: "supplierListedPrice", label: "Listed price", numeric: true, text: (o) => fmtMoney(o.orderInfo?.supplierListedPrice) },
  { key: "supplierDiscountedPrice", label: "Discounted price", numeric: true, text: (o) => fmtMoney(o.orderInfo?.supplierDiscountedPrice) },
  { key: "supName", label: "Supplier name", text: (o) => o.gst?.supName || "-" },
  { key: "gstin", label: "GSTIN", text: (o) => o.gst?.gstin || "-" },
  { key: "taxableShipping", label: "Taxable shipping", numeric: true, text: (o) => fmtMoney(o.gst?.taxableShipping) },
  { key: "enrollmentNo", label: "Enrollment no.", text: (o) => o.gst?.enrollmentNo || "-" },
  { key: "manifestDate", label: "Manifest date", text: (o) => fmtDate(o.gst?.manifestDate) },
  { key: "ecoTcsGstin", label: "E-comm TCS GSTIN", text: (o) => o.gst?.ecoTcsGstin || "-" },
  { key: "financialYear", label: "Financial year", text: (o) => o.gst?.financialYear || "-" },
  { key: "monthNumber", label: "Month number", text: (o) => String(o.gst?.monthNumber ?? "-") },
  { key: "supplierId", label: "Supplier ID", text: (o) => o.gst?.supplierId || "-" },
];

export default function ExcelDataPage() {
  const { lang } = useLanguage();
  const [view, setView] = useState<View>("sales");
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extraCols, setExtraCols] = useState<string[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [search, setSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);

  function switchView(v: View) {
    setView(v);
    setPage(1);
  }

  useEffect(() => {
    getOrderStats()
      .then(setOrderStats)
      .catch(() => {
        // month-range banner is a nice-to-have, don't block the table on it
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getOrders({
      returned: view === "returns" ? true : undefined,
      orderStatus: view === "rto" ? "RTO_COMPLETE" : undefined,
      q: search.trim() || undefined,
      page,
      limit: PAGE_SIZE,
    })
      .then((res) => {
        setOrders(res.orders);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load Excel data"))
      .finally(() => setLoading(false));
  }, [view, page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const availableCols = EXTRA_COLUMNS.filter((c) => !extraCols.includes(c.key));
  const visibleCoreCols = CORE_COLUMNS.filter((c) => !c.showIf || c.showIf(view));
  const visibleExtraCols = EXTRA_COLUMNS.filter((c) => extraCols.includes(c.key));
  const allVisibleCols = [...visibleCoreCols, ...visibleExtraCols];

  const filteredOrders = useMemo(() => {
    const active = Object.entries(filters).filter(([, v]) => v.trim() !== "");
    if (active.length === 0) return orders;
    return orders.filter((o) =>
      active.every(([key, needle]) => {
        const col = allVisibleCols.find((c) => c.key === key);
        if (!col) return true;
        return col.text(o).toLowerCase().includes(needle.trim().toLowerCase());
      })
    );
  }, [orders, filters, allVisibleCols]);

  return (
    <div className="card">
      <h2>{bilingual("All order data", "heading.allOrderData", lang)}</h2>
      <p className="muted">
        Everything merged together — GST report, shipping labels, Orders export, and Order Summary
        (payout) export, per order. Click any row for a plain-language breakdown.
        {orderStats?.earliestOrderDate && orderStats?.latestOrderDate && (
          <>
            {" "}
            Data covers{" "}
            {fmtMonth(orderStats.earliestOrderDate) === fmtMonth(orderStats.latestOrderDate)
              ? fmtMonth(orderStats.earliestOrderDate)
              : `${fmtMonth(orderStats.earliestOrderDate)} to ${fmtMonth(orderStats.latestOrderDate)}`}
            .
          </>
        )}
      </p>
      <div className="filter-row" style={{ justifyContent: "space-between" }}>
        <div className="filter-row" style={{ margin: 0 }}>
          <button className={view === "sales" ? "chip chip-active" : "chip"} onClick={() => switchView("sales")}>
            Sales (tcs_sales.xlsx)
          </button>
          <button className={view === "returns" ? "chip chip-active" : "chip"} onClick={() => switchView("returns")}>
            Returns (tcs_sales_return.xlsx)
          </button>
          <button className={view === "rto" ? "chip chip-active" : "chip"} onClick={() => switchView("rto")}>
            RTO
          </button>
        </div>
        {availableCols.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && setExtraCols((cols) => [...cols, e.target.value])}
          >
            <option value="">+ Add column (accounting/tax detail)</option>
            {availableCols.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="filter-row" style={{ justifyContent: "space-between" }}>
        <input
          type="text"
          placeholder="Search by order ID, customer name, or SKU..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ flex: 1, minWidth: 240 }}
        />
        <button type="button" className="ghost" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? "Hide column filters" : "Advanced: filter by column"}
        </button>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="warning-text">{error}</p>}

      {!loading && !error && orders.length === 0 && (
        <p className="muted">
          No {view === "sales" ? "orders" : view === "returns" ? "returns" : "RTO orders"} yet — upload your files to
          get started.
        </p>
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {visibleCoreCols.map((col) => (
                  <th key={col.key} className={col.numeric ? "num-cell" : undefined} title={col.help}>
                    {col.label}
                  </th>
                ))}
                {visibleExtraCols.map((col) => (
                  <th key={col.key} className={col.numeric ? "num-cell" : undefined} title={col.help}>
                    {col.label}{" "}
                    <button
                      type="button"
                      className="ghost"
                      style={{ padding: "1px 7px", fontSize: 11, marginLeft: 4 }}
                      onClick={() => setExtraCols((cols) => cols.filter((k) => k !== col.key))}
                    >
                      x
                    </button>
                  </th>
                ))}
              </tr>
              {showAdvanced && (
                <tr>
                  {allVisibleCols.map((col) => (
                    <th key={col.key}>
                      {col.selectOptions ? (
                        <select
                          className="col-filter"
                          value={filters[col.key] || ""}
                          onChange={(e) => setFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                        >
                          <option value="">All</option>
                          {col.selectOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="col-filter"
                          placeholder="Filter..."
                          value={filters[col.key] || ""}
                          onChange={(e) => setFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {filteredOrders.map((o) => (
                <tr key={o._id} className="row-clickable" onClick={() => setSelected(o)}>
                  {allVisibleCols.map((col) => (
                    <td
                      key={col.key}
                      data-label={col.label}
                      className={col.numeric ? "num-cell" : col.mono ? "mono-cell" : undefined}
                    >
                      {col.render ? col.render(o) : col.text(o)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
          <span className="muted" style={{ margin: 0 }}>
            Page {page} of {totalPages}
          </span>
          <button className="ghost" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button className="ghost" disabled={loading || page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {selected && <OrderBreakdownModal order={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

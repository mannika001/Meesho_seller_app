import { useEffect, useMemo, useState } from "react";
import { getProducts, type Product } from "../api";
import ProductBreakdownModal from "../components/ProductBreakdownModal";
import { useLanguage } from "../LanguageContext";
import { bilingual } from "../i18n";

function fmtMoney(n: number) {
  return `Rs.${n.toFixed(2)}`;
}

export default function ProductsPage() {
  const { lang } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getProducts()
      .then((res) => setProducts(res.products))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load products"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.productName?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const totals = useMemo(
    () =>
      products.reduce(
        (acc, p) => ({
          orderValue: acc.orderValue + p.totalOrderValue,
          payout: acc.payout + p.totalPayoutValue,
        }),
        { orderValue: 0, payout: 0 }
      ),
    [products]
  );

  return (
    <>
      {!loading && !error && products.length > 0 && (
        <div className="card">
          <h2>{bilingual("At a glance", "heading.atAGlance", lang)}</h2>
          <div className="summary-grid">
            <div className="stat c-sky">
              <div className="stat-num">{products.length}</div>
              <div className="stat-label">products</div>
            </div>
            <div className="stat c-mint">
              <div className="stat-num">{fmtMoney(totals.orderValue)}</div>
              <div className="stat-label">total order value</div>
            </div>
            <div className="stat c-peach">
              <div className="stat-num">{fmtMoney(totals.payout)}</div>
              <div className="stat-label">what you actually got paid</div>
            </div>
            <div className="stat c-coral">
              <div className="stat-num">{fmtMoney(totals.orderValue - totals.payout)}</div>
              <div className="stat-label">kept by Meesho (commission + fees + returns)</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>{bilingual("Products", "nav.products", lang)}</h2>
        <p className="muted">
          Per-product totals from your GST report (invoice value, GST tax) and Orders Excel export
          (listed/discounted price). Order value and payout received come from your Order Summary
          export — the gap between them is Meesho's commission, fees, and return losses combined, not
          a clean commission-only figure. Upload it to see what actually lands in your account per
          product. Click any row for a visual breakdown.
        </p>

        {loading && <p className="muted">Loading...</p>}
        {error && <p className="warning-text">{error}</p>}

        {!loading && !error && products.length === 0 && (
          <p className="muted">
            No products yet — upload your Orders Excel export (Orders &gt; top-right corner &gt; Download
            order data) to see product names here.
          </p>
        )}

        {!loading && !error && products.length > 0 && (
          <>
            <input
              type="text"
              placeholder="Search products by name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", marginBottom: 14 }}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th className="num-cell">Orders</th>
                    <th className="num-cell">Qty</th>
                    <th className="num-cell" title="Pre-tax sale value from your GST report">
                      Taxable value
                    </th>
                    <th className="num-cell" title="GST charged, from your GST report">GST tax</th>
                    <th className="num-cell">Invoice value</th>
                    <th className="num-cell">Listed price</th>
                    <th className="num-cell">Discounted price</th>
                    <th className="num-cell">Order value</th>
                    <th className="num-cell">What you got paid</th>
                    <th className="num-cell" title="Order value minus what you got paid — commission, fees, and return losses combined">
                      Kept by Meesho
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.catalogId} className="row-clickable" onClick={() => setSelected(p)}>
                      <td data-label="Product" style={{ fontWeight: 500 }}>
                        {p.productName || "-"}
                        <span className="row-view-hint">View breakdown →</span>
                      </td>
                      <td data-label="SKU" className="mono-cell">{p.sku || "-"}</td>
                      <td data-label="Orders" className="num-cell">{p.totalOrders}</td>
                      <td data-label="Qty" className="num-cell">{p.totalQuantity}</td>
                      <td data-label="Taxable value" className="num-cell">{fmtMoney(p.totalTaxableValue)}</td>
                      <td data-label="GST tax" className="num-cell">{fmtMoney(p.totalTaxAmount)}</td>
                      <td data-label="Invoice value" className="num-cell">{fmtMoney(p.totalInvoiceValue)}</td>
                      <td data-label="Listed price" className="num-cell">{fmtMoney(p.totalListedPrice)}</td>
                      <td data-label="Discounted price" className="num-cell">{fmtMoney(p.totalDiscountedPrice)}</td>
                      <td data-label="Order value" className="num-cell">{fmtMoney(p.totalOrderValue)}</td>
                      <td data-label="What you got paid" className="num-cell">{fmtMoney(p.totalPayoutValue)}</td>
                      <td data-label="Kept by Meesho" className="num-cell">
                        {fmtMoney(p.totalOrderValue - p.totalPayoutValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {selected && <ProductBreakdownModal product={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

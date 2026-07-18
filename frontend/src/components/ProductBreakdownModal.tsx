import { useEffect } from "react";
import type { Product } from "../api";

function fmtMoney(n: number) {
  return `Rs.${n.toFixed(2)}`;
}

// Validated pair (dataviz skill's default categorical slots 2 + 8 — green/red,
// adjacent-pair CVD checked): node scripts/validate_palette.js "#008300,#e34948"
const SLICE_COLORS = { payout: "#008300", deduction: "#e34948" };

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export default function ProductBreakdownModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const payout = product.totalPayoutValue;
  const deduction = product.totalOrderValue - product.totalPayoutValue;
  const total = product.totalOrderValue;

  const slices =
    total > 0
      ? [
          { key: "payout", label: "Payout received", value: Math.max(payout, 0), color: SLICE_COLORS.payout },
          { key: "deduction", label: "Est. deduction", value: Math.max(deduction, 0), color: SLICE_COLORS.deduction },
        ].filter((s) => s.value > 0)
      : [];

  let angle = 0;
  const arcs = slices.map((s) => {
    const sliceAngle = (s.value / total) * 360;
    const path = arcPath(60, 60, 60, angle, angle + sliceAngle);
    angle += sliceAngle;
    return { ...s, path, pct: (s.value / total) * 100 };
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0 }}>{product.productName || product.catalogId}</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              {product.sku || product.catalogId} · {product.totalOrders} orders
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {total <= 0 ? (
          <p className="muted" style={{ marginTop: 16 }}>
            No Order Summary data for this product yet — upload your Order Summary export to see the
            payout breakdown.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 24, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
            <svg width={120} height={120} viewBox="0 0 120 120" role="img" aria-label="Order value breakdown">
              {arcs.map((a) => (
                <path key={a.key} d={a.path} fill={a.color} stroke="#ffffff" strokeWidth={2}>
                  <title>
                    {a.label}: {fmtMoney(a.value)} ({a.pct.toFixed(0)}%)
                  </title>
                </path>
              ))}
            </svg>
            <div style={{ flex: 1, minWidth: 180 }}>
              {arcs.map((a) => (
                <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span
                    style={{ width: 12, height: 12, borderRadius: 3, background: a.color, flexShrink: 0 }}
                  />
                  <span style={{ flex: 1 }}>{a.label}</span>
                  <strong>{fmtMoney(a.value)}</strong>
                  <span className="muted" style={{ marginBottom: 0, width: 40, textAlign: "right" }}>
                    {a.pct.toFixed(0)}%
                  </span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
                <span className="muted" style={{ marginBottom: 0 }}>
                  Order value: <strong style={{ color: "var(--text)" }}>{fmtMoney(total)}</strong>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

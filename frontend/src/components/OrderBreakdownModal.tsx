import { useEffect } from "react";
import type { Order } from "../api";

function fmtMoney(n: number) {
  return `Rs.${n.toFixed(2)}`;
}

// Validated triple (dataviz skill's default categorical slots 1 + 2 + 8 —
// blue/green/red, all-pairs CVD checked): node scripts/validate_palette.js
// "#2a78d6,#008300,#e34948" --mode light --pairs all
const SLICE_COLORS = { tax: "#2a78d6", commission: "#e34948", settled: "#008300" };

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

export default function OrderBreakdownModal({ order, onClose }: { order: Order; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const orderValue = order.payout?.price;
  const tax = order.gst?.taxAmount ?? 0;
  const settled = order.payout?.payoutValue ?? 0;
  // Order value = tax + commission + settled amount — commission is the
  // remainder once tax and what actually landed in the bank are carved out,
  // so the three slices are additive parts of one whole (order value is the
  // chart's total/label, not a fourth slice).
  const commission = orderValue != null ? orderValue - tax - settled : 0;

  const slices =
    orderValue != null && orderValue > 0
      ? [
          { key: "tax", label: "GST tax", value: Math.max(tax, 0), color: SLICE_COLORS.tax },
          { key: "commission", label: "Est. Meesho commission", value: Math.max(commission, 0), color: SLICE_COLORS.commission },
          { key: "settled", label: "Settled amount", value: Math.max(settled, 0), color: SLICE_COLORS.settled },
        ].filter((s) => s.value > 0)
      : [];

  let angle = 0;
  const arcs = slices.map((s) => {
    const sliceAngle = (s.value / orderValue!) * 360;
    const path = arcPath(60, 60, 60, angle, angle + sliceAngle);
    angle += sliceAngle;
    return { ...s, path, pct: (s.value / orderValue!) * 100 };
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0 }}>{order.orderInfo?.productName || order.subOrderNum}</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              {order.subOrderNum}
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {!orderValue ? (
          <p className="muted" style={{ marginTop: 16 }}>
            No Order Summary data for this order yet — upload your Order Summary export to see the
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
            <div style={{ flex: 1, minWidth: 200 }}>
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
                  Order value: <strong style={{ color: "var(--text)" }}>{fmtMoney(orderValue)}</strong>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { getOrders, type Customer, type Order } from "../api";

function fmtDate(d?: string) {
  return d ? new Date(d).toLocaleDateString() : "-";
}

function fmtMoney(n?: number) {
  return typeof n === "number" ? `Rs.${n.toFixed(2)}` : "-";
}

export default function CustomerOrdersModal({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    getOrders({ customerKey: customer.customerKey, limit: 200 })
      .then((res) => setOrders(res.orders))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load orders"))
      .finally(() => setLoading(false));
  }, [customer.customerKey]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0 }}>{customer.displayName || "Unknown customer"}</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              {[customer.address, customer.pincode].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {loading && <p className="muted" style={{ marginTop: 16 }}>Loading...</p>}
        {error && <p className="warning-text" style={{ marginTop: 16 }}>{error}</p>}

        {!loading && !error && orders.length === 0 && (
          <p className="muted" style={{ marginTop: 16 }}>No orders found for this customer.</p>
        )}

        {!loading && !error && orders.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Sub order num</th>
                  <th>Product</th>
                  <th>Order date</th>
                  <th className="num-cell">Invoice value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o._id}>
                    <td data-label="Sub order num" className="mono-cell">{o.subOrderNum}</td>
                    <td data-label="Product">{o.orderInfo?.productName || o.label?.sku || "-"}</td>
                    <td data-label="Order date">{fmtDate(o.gst?.orderDate)}</td>
                    <td data-label="Invoice value" className="num-cell">{fmtMoney(o.gst?.totalInvoiceValue)}</td>
                    <td data-label="Status">
                      {o.isReturned ? (
                        <span className="tag returned">Returned</span>
                      ) : (
                        <span className="tag delivered">{o.orderInfo?.orderStatus || "Active"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

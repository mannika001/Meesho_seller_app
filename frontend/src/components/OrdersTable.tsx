import type { Order } from "../api";

export default function OrdersTable({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return <p className="muted">No orders yet — upload a monthly export to get started.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Order no.</th>
          <th>Date</th>
          <th>Customer</th>
          <th>Pincode</th>
          <th>SKU</th>
          <th>Value</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o._id}>
            <td className="mono-cell">{o.subOrderNum}</td>
            <td>{o.gst?.orderDate ? new Date(o.gst.orderDate).toLocaleDateString() : "-"}</td>
            <td style={{ fontWeight: 500 }}>{o.label?.customerName || "-"}</td>
            <td className="mono-cell">{o.label?.pincode || "-"}</td>
            <td>{o.label?.sku || "-"}</td>
            <td>{o.gst?.totalInvoiceValue ? `Rs.${o.gst.totalInvoiceValue.toFixed(0)}` : "-"}</td>
            <td>
              <span className={`tag ${o.isReturned ? "returned" : "delivered"}`}>
                {o.isReturned ? "Returned" : "Delivered"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

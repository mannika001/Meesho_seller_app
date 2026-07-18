import { useMemo, useState } from "react";
import type { Customer } from "../api";

export const TAG_LABEL: Record<Customer["scamTag"], string> = {
  none: "Clean",
  little_scammy: "Little scammy",
  total_scammy: "Total scammy",
  not_enough_data: "Not enough data",
};

export const TAG_CLASS: Record<Customer["scamTag"], string> = {
  none: "none",
  little_scammy: "little",
  total_scammy: "total",
  not_enough_data: "none",
};

type Column = {
  key: string;
  label: string;
  value: (c: Customer) => string;
};

const COLUMNS: Column[] = [
  { key: "customer", label: "Customer", value: (c) => c.displayName || "" },
  { key: "address", label: "Address", value: (c) => c.address || "" },
  { key: "state", label: "State", value: (c) => c.state || "" },
  { key: "pincode", label: "Pincode", value: (c) => c.pincode || "" },
  { key: "orders", label: "Orders", value: (c) => String(c.totalOrders) },
  { key: "returned", label: "Returned", value: (c) => String(c.returnedOrders) },
  {
    key: "returnRate",
    label: "Return rate",
    value: (c) => (c.totalOrders > 0 ? `${(c.returnRate * 100).toFixed(0)}%` : ""),
  },
  {
    key: "tag",
    label: "Tag",
    value: (c) => [c.isRepeat ? "Repeat" : "", TAG_LABEL[c.scamTag]].filter(Boolean).join(" "),
  },
];

export default function CustomerTable({
  customers,
  onSelect,
}: {
  customers: Customer[];
  onSelect?: (c: Customer) => void;
}) {
  const [search, setSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = customers;
    if (q) {
      result = result.filter((c) => COLUMNS.some((col) => col.value(c).toLowerCase().includes(q)));
    }
    const active = Object.entries(filters).filter(([, v]) => v.trim() !== "");
    if (active.length > 0) {
      result = result.filter((c) =>
        active.every(([key, needle]) => {
          const col = COLUMNS.find((col) => col.key === key)!;
          return col.value(c).toLowerCase().includes(needle.trim().toLowerCase());
        })
      );
    }
    return result;
  }, [customers, search, filters]);

  if (customers.length === 0) {
    return <p className="muted">No customers yet — upload label PDFs to identify customers by name + pincode.</p>;
  }

  return (
    <div>
      <div className="filter-row" style={{ justifyContent: "space-between" }}>
        <input
          type="text"
          placeholder="Search customers by name, address, pincode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button type="button" className="ghost" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? "Hide column filters" : "Advanced: filter by column"}
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} data-label={col.label}>
                  {col.label}
                </th>
              ))}
            </tr>
            {showAdvanced && (
              <tr>
                {COLUMNS.map((col) =>
                  col.key === "tag" ? (
                    <th key={col.key}>
                      <select
                        className="col-filter"
                        value={filters.tag || ""}
                        onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}
                      >
                        <option value="">All tags</option>
                        <option value="Repeat">Repeat</option>
                        {Object.entries(TAG_LABEL).map(([k, label]) => (
                          <option key={k} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </th>
                  ) : (
                    <th key={col.key}>
                      <input
                        type="text"
                        className="col-filter"
                        placeholder="Filter..."
                        value={filters[col.key] || ""}
                        onChange={(e) => setFilters((f) => ({ ...f, [col.key]: e.target.value }))}
                      />
                    </th>
                  )
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c._id} className={onSelect ? "row-clickable" : undefined} onClick={() => onSelect?.(c)}>
                <td data-label="Customer" style={{ fontWeight: 500 }}>
                  {c.displayName}
                  {onSelect && <span className="row-view-hint">View orders →</span>}
                </td>
                <td data-label="Address" className="muted">{c.address || "-"}</td>
                <td data-label="State" className="muted">{c.state || "-"}</td>
                <td data-label="Pincode" className="mono-cell">{c.pincode}</td>
                <td data-label="Orders">{c.totalOrders}</td>
                <td data-label="Returned">{c.returnedOrders}</td>
                <td data-label="Return rate">{c.totalOrders > 0 ? `${(c.returnRate * 100).toFixed(0)}%` : "—"}</td>
                <td data-label="Tag">
                  {c.isRepeat && <span className="tag repeat" style={{ marginRight: 6 }}>Repeat</span>}
                  <span className={`tag ${TAG_CLASS[c.scamTag]}`}>{TAG_LABEL[c.scamTag]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

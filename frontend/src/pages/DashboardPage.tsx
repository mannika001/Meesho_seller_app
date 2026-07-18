import { useEffect, useState } from "react";
import { getCustomers, type Customer } from "../api";
import CustomerTable from "../components/CustomerTable";
import CustomerOrdersModal from "../components/CustomerOrdersModal";
import { useLanguage } from "../LanguageContext";
import { bilingual } from "../i18n";

const TAG_OPTIONS = [
  { value: "", label: "All customers" },
  { value: "repeat", label: "Repeat customers" },
  { value: "little_scammy", label: "Little scammy" },
  { value: "total_scammy", label: "Total scammy" },
  { value: "not_enough_data", label: "Not enough data" },
];

export default function DashboardPage() {
  const { lang } = useLanguage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getCustomers(tag || undefined)
      .then((res) => setCustomers(res.customers))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load customers"))
      .finally(() => setLoading(false));
  }, [tag]);

  if (loading) return <p className="muted">Loading...</p>;
  if (error) return <p className="warning-text">{error}</p>;

  const repeatCount = customers.filter((c) => c.isRepeat).length;
  const riskyCount = customers.filter((c) => c.scamTag === "little_scammy" || c.scamTag === "total_scammy").length;
  const avgReturnRate =
    customers.length > 0 ? customers.reduce((s, c) => s + c.returnRate, 0) / customers.length : 0;

  return (
    <>
      <div className="card">
        <h2>{bilingual("At a glance", "heading.atAGlance", lang)}</h2>
        <div className="summary-grid">
          <div className="stat c-sky">
            <div className="stat-num">{customers.length}</div>
            <div className="stat-label">customers</div>
          </div>
          <div className="stat c-mint">
            <div className="stat-num">{repeatCount}</div>
            <div className="stat-label">repeat buyers</div>
          </div>
          <div className="stat c-coral">
            <div className="stat-num">{riskyCount}</div>
            <div className="stat-label">flagged as return-risky</div>
          </div>
          <div className="stat c-peach">
            <div className="stat-num">{(avgReturnRate * 100).toFixed(0)}%</div>
            <div className="stat-label">average return rate</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>{bilingual("Customers", "heading.customers", lang)}</h2>
        <p className="muted">Repeat buyers and return-risk, at a glance.</p>
        <div className="filter-row">
          {TAG_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={tag === o.value ? "chip chip-active" : "chip"}
              onClick={() => setTag(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <CustomerTable customers={customers} onSelect={setSelected} />
      </div>

      {selected && <CustomerOrdersModal customer={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

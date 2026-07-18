import { Fragment, useEffect, useRef, useState } from "react";
import { planChat, confirmChat, type ChatCall, type ChatToolResult } from "../api";
import OrdersTable from "./OrdersTable";
import CustomerTable from "./CustomerTable";

interface Turn {
  question: string;
  answer: string;
  data?: ChatToolResult[];
}

interface Plan {
  question: string;
  calls: ChatCall[];
  summary: string;
}

function StatsView({ stats }: { stats: Record<string, number> }) {
  const rate = stats.returnRate ?? 0;
  return (
    <div className="card" style={{ margin: "8px 0 0", padding: 14 }}>
      <div className="summary-grid">
        <div className="stat c-sky">
          <div className="stat-num">{stats.totalOrders}</div>
          <div className="stat-label">Total orders</div>
        </div>
        <div className="stat c-coral">
          <div className="stat-num">{stats.totalReturned}</div>
          <div className="stat-label">Returned</div>
        </div>
        <div className="stat c-mint">
          <div className="stat-num">{stats.totalCustomers}</div>
          <div className="stat-label">Customers</div>
        </div>
        <div className="stat c-peach">
          <div className="stat-num">{stats.repeatCustomers}</div>
          <div className="stat-label">Repeat customers</div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="stat-label" style={{ marginBottom: 6 }}>
          Return rate — {(rate * 100).toFixed(1)}%
        </div>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${Math.min(100, rate * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function ChatData({ data }: { data: ChatToolResult[] }) {
  return (
    <>
      {data.map((d, i) => {
        if (d.tool === "get_stats") return <StatsView key={i} stats={d.result} />;
        if (d.tool === "search_orders")
          return (
            <div className="card table-scroll" style={{ margin: "8px 0 0", padding: 14 }} key={i}>
              <OrdersTable orders={d.result.orders} />
            </div>
          );
        if (d.tool === "search_customers")
          return (
            <div className="card table-scroll" style={{ margin: "8px 0 0", padding: 14 }} key={i}>
              <CustomerTable customers={d.result.customers} />
            </div>
          );
        return null;
      })}
    </>
  );
}

const SUGGESTIONS = [
  "How many repeat customers do I have?",
  "Who are my scammy customers?",
  "What's my overall return rate?",
];

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.8 5.6L19.5 9.5l-5.7 1.9L12 17l-1.8-5.6L4.5 9.5l5.7-1.9L12 2z" />
      <path d="M19 15l.9 2.7L22.5 18.5l-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.8L19 15z" opacity="0.7" />
    </svg>
  );
}

function Avatar({ role }: { role: "user" | "bot" }) {
  return <div className={`avatar ${role}`}>{role === "user" ? <UserIcon /> : <AiIcon />}</div>;
}

export default function ChatBox() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const busy = planning || answering || !!plan;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pendingQuestion, plan, planning, answering]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const trimmed = q.trim();
    setPlanning(true);
    setError(null);
    setQuestion("");
    setPendingQuestion(trimmed);
    try {
      const res = await planChat(trimmed);
      if (!res.needsData) {
        setTurns((prev) => [...prev, { question: trimmed, answer: res.answer }]);
        setPendingQuestion(null);
      } else {
        setPlan({ question: res.question, calls: res.calls, summary: res.summary });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPendingQuestion(null);
    } finally {
      setPlanning(false);
    }
  }

  async function confirmPlan() {
    if (!plan) return;
    setAnswering(true);
    setError(null);
    try {
      const res = await confirmChat(plan.question, plan.calls);
      setTurns((prev) => [...prev, { question: plan.question, answer: res.answer, data: res.data }]);
      setPlan(null);
      setPendingQuestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAnswering(false);
    }
  }

  function cancelPlan() {
    setPlan(null);
    setPendingQuestion(null);
    setError(null);
  }

  return (
    <div className="chat-box">
      <div className="chat-window">
        {turns.length === 0 && !busy && (
          <p className="muted" style={{ margin: "8px 0" }}>
            Ask anything about your orders, customers, or returns — try one of the suggestions
            below to get started. I'll show you the exact query before running it.
          </p>
        )}
        {turns.map((t, i) => (
          <Fragment key={i}>
            <div className="chat-row user">
              <div className="msg user">{t.question}</div>
              <Avatar role="user" />
            </div>
            <div className="chat-row bot">
              <Avatar role="bot" />
              <div className="msg bot" style={t.data?.length ? { maxWidth: "92%" } : undefined}>
                {t.answer}
                {!!t.data?.length && <ChatData data={t.data} />}
              </div>
            </div>
          </Fragment>
        ))}
        {pendingQuestion && (
          <div className="chat-row user">
            <div className="msg user">{pendingQuestion}</div>
            <Avatar role="user" />
          </div>
        )}
        {planning && (
          <div className="chat-row bot">
            <Avatar role="bot" />
            <div className="msg bot typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        {plan && !answering && (
          <div className="chat-row bot">
            <Avatar role="bot" />
            <div className="msg bot">
              <div className="muted" style={{ marginBottom: 8 }}>
                I'll look up: <strong style={{ color: "var(--text)" }}>{plan.summary}</strong>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="primary" onClick={confirmPlan}>
                  Confirm
                </button>
                <button type="button" className="ghost" onClick={cancelPlan}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {answering && (
          <div className="chat-row bot">
            <Avatar role="bot" />
            <div className="msg bot typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="chat-input-row"
      >
        <input
          type="text"
          placeholder={busy ? "Confirm or cancel the pending query above..." : "Ask a question about your orders..."}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy}
          style={{ flex: 1 }}
        />
        <button className="primary" type="submit" disabled={busy || !question.trim()}>
          {planning ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error && <p className="warning-text" style={{ marginTop: 12 }}>{error}</p>}

      {turns.length === 0 && !busy && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <span key={s} className="suggestion" onClick={() => ask(s)}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

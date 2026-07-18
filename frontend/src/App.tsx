import { useState } from "react";
import UploadPage from "./pages/UploadPage";
import DashboardPage from "./pages/DashboardPage";
import ExcelDataPage from "./pages/ExcelDataPage";
import ProductsPage from "./pages/ProductsPage";
import ChatPage from "./pages/ChatPage";
import { useLanguage } from "./LanguageContext";
import { bilingual, LANGUAGES, type Lang, type TranslationKey } from "./i18n";

type Tab = "upload" | "dashboard" | "exceldata" | "products" | "chat";

const TABS: { id: Tab; key: TranslationKey; label: string }[] = [
  { id: "upload", key: "nav.upload", label: "Upload" },
  { id: "dashboard", key: "nav.dashboard", label: "Dashboard" },
  { id: "exceldata", key: "nav.exceldata", label: "Excel data" },
  { id: "products", key: "nav.products", label: "Products" },
  { id: "chat", key: "nav.chat", label: "Ask AI" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("upload");
  const { lang, setLang } = useLanguage();

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">EC</div>
          <div>
            <div className="brand-name">EcommerceClarity</div>
            <div className="brand-sub">v1 · Meesho data</div>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "tab tab-active" : "tab"}
              onClick={() => setTab(t.id)}
            >
              {bilingual(t.label, t.key, lang)}
            </button>
          ))}
        </nav>
        <select
          value={lang === "en" ? "" : lang}
          onChange={(e) => setLang((e.target.value || "en") as Lang)}
          title="Heading language"
        >
          <option value="">English only</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <main>
        {tab === "upload" && <UploadPage />}
        {tab === "dashboard" && <DashboardPage />}
        {tab === "exceldata" && <ExcelDataPage />}
        {tab === "products" && <ProductsPage />}
        {tab === "chat" && <ChatPage />}
      </main>
    </div>
  );
}

import ChatBox from "../components/ChatBox";
import { useLanguage } from "../LanguageContext";
import { bilingual } from "../i18n";

export default function ChatPage() {
  const { lang } = useLanguage();
  return (
    <div className="card chat-card">
      <h2>{bilingual("Ask about your data", "heading.askAboutData", lang)}</h2>
      <p className="muted">
        Ask a plain-language question about your uploaded orders and customers — e.g. "how many
        orders were returned in June?" or "which customers ordered more than once?"
      </p>
      <ChatBox />
    </div>
  );
}

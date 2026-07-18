// Bilingual heading support: English stays as the source of truth, a second
// language renders alongside it ("Products / उत्पाद"). Covers nav tabs and
// page headings only — not the full app (buttons, table columns, messages
// stay English). Translations below are machine-generated best effort, not
// reviewed by a native speaker of each language — verify before relying on
// them for real sellers.

export type LangCode = "hi" | "ta" | "te" | "mr" | "bn";
export type Lang = LangCode | "en";

export const LANGUAGES: { code: LangCode; label: string }[] = [
  { code: "hi", label: "हिंदी" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "mr", label: "मराठी" },
  { code: "bn", label: "বাংলা" },
];

export type TranslationKey =
  | "nav.upload"
  | "nav.dashboard"
  | "nav.exceldata"
  | "nav.products"
  | "nav.chat"
  | "heading.uploadFiles"
  | "heading.orderOverview"
  | "heading.uploadHistory"
  | "heading.atAGlance"
  | "heading.customers"
  | "heading.allOrderData"
  | "heading.askAboutData";

const TRANSLATIONS: Record<LangCode, Record<TranslationKey, string>> = {
  hi: {
    "nav.upload": "अपलोड",
    "nav.dashboard": "डैशबोर्ड",
    "nav.exceldata": "एक्सेल डेटा",
    "nav.products": "उत्पाद",
    "nav.chat": "एआई से पूछें",
    "heading.uploadFiles": "इस महीने की फ़ाइलें अपलोड करें",
    "heading.orderOverview": "ऑर्डर अवलोकन",
    "heading.uploadHistory": "अपलोड इतिहास",
    "heading.atAGlance": "एक नज़र में",
    "heading.customers": "ग्राहक",
    "heading.allOrderData": "सभी ऑर्डर डेटा",
    "heading.askAboutData": "अपने डेटा के बारे में पूछें",
  },
  ta: {
    "nav.upload": "பதிவேற்று",
    "nav.dashboard": "டாஷ்போர்டு",
    "nav.exceldata": "எக்செல் தரவு",
    "nav.products": "தயாரிப்புகள்",
    "nav.chat": "AI-யிடம் கேளுங்கள்",
    "heading.uploadFiles": "இந்த மாத கோப்புகளை பதிவேற்றவும்",
    "heading.orderOverview": "ஆர்டர் மேலோட்டம்",
    "heading.uploadHistory": "பதிவேற்ற வரலாறு",
    "heading.atAGlance": "ஒரு பார்வையில்",
    "heading.customers": "வாடிக்கையாளர்கள்",
    "heading.allOrderData": "அனைத்து ஆர்டர் தரவு",
    "heading.askAboutData": "உங்கள் தரவைப் பற்றி கேளுங்கள்",
  },
  te: {
    "nav.upload": "అప్‌లోడ్",
    "nav.dashboard": "డాష్‌బోర్డ్",
    "nav.exceldata": "ఎక్సెల్ డేటా",
    "nav.products": "ఉత్పత్తులు",
    "nav.chat": "AI ని అడగండి",
    "heading.uploadFiles": "ఈ నెల ఫైళ్లను అప్‌లోడ్ చేయండి",
    "heading.orderOverview": "ఆర్డర్ అవలోకనం",
    "heading.uploadHistory": "అప్‌లోడ్ చరిత్ర",
    "heading.atAGlance": "ఒక్క చూపులో",
    "heading.customers": "వినియోగదారులు",
    "heading.allOrderData": "అన్ని ఆర్డర్ డేటా",
    "heading.askAboutData": "మీ డేటా గురించి అడగండి",
  },
  mr: {
    "nav.upload": "अपलोड",
    "nav.dashboard": "डॅशबोर्ड",
    "nav.exceldata": "एक्सेल डेटा",
    "nav.products": "उत्पादने",
    "nav.chat": "AI ला विचारा",
    "heading.uploadFiles": "या महिन्याच्या फाइल्स अपलोड करा",
    "heading.orderOverview": "ऑर्डर विहंगावलोकन",
    "heading.uploadHistory": "अपलोड इतिहास",
    "heading.atAGlance": "एका दृष्टीक्षेपात",
    "heading.customers": "ग्राहक",
    "heading.allOrderData": "सर्व ऑर्डर डेटा",
    "heading.askAboutData": "तुमच्या डेटाबद्दल विचारा",
  },
  bn: {
    "nav.upload": "আপলোড",
    "nav.dashboard": "ড্যাশবোর্ড",
    "nav.exceldata": "এক্সেল ডেটা",
    "nav.products": "পণ্য",
    "nav.chat": "AI-কে জিজ্ঞাসা করুন",
    "heading.uploadFiles": "এই মাসের ফাইল আপলোড করুন",
    "heading.orderOverview": "অর্ডার ওভারভিউ",
    "heading.uploadHistory": "আপলোড ইতিহাস",
    "heading.atAGlance": "এক নজরে",
    "heading.customers": "গ্রাহক",
    "heading.allOrderData": "সমস্ত অর্ডার ডেটা",
    "heading.askAboutData": "আপনার ডেটা সম্পর্কে জিজ্ঞাসা করুন",
  },
};

// English label stays, translated label rides alongside it ("Products / உत्पाद").
// Falls back to English-only if lang is "en" or a key is missing.
export function bilingual(english: string, key: TranslationKey, lang: Lang): string {
  if (lang === "en") return english;
  const translated = TRANSLATIONS[lang]?.[key];
  return translated ? `${english} / ${translated}` : english;
}

import "dotenv/config";

export const config = {
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/meesho-seller-app",
  port: Number(process.env.PORT) || 4000,
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  // Netlify frontend origin allowed to call this API in production. Unset
  // (local dev) falls back to allowing any origin, since Vite's dev proxy
  // already same-origins requests and there's no real CORS boundary to guard.
  corsOrigin: process.env.CORS_ORIGIN || true,
  scam: {
    minOrders: Number(process.env.SCAM_MIN_ORDERS) || 3,
    littleThreshold: Number(process.env.SCAM_LITTLE_THRESHOLD) || 0.3,
    totalThreshold: Number(process.env.SCAM_TOTAL_THRESHOLD) || 0.6,
  },
};

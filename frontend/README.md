# Meesho Seller App (v1)

Personal tool for a Meesho seller: upload your monthly Meesho exports, get order stats, repeat-customer and scam-risk tracking, product-level breakdowns, and a chat assistant that can answer questions about your own data in plain English.

v1 is single-user, no login.

## What it does

The app has 5 tabs:

- **Upload** — drop in your monthly files, see order stats and upload history.
- **Dashboard** — customers grouped by repeat/scam-risk.
- **Excel data** — every order in a searchable, filterable table.
- **Products** — sales and payout totals grouped by product.
- **Ask AI** — ask questions about your data in plain English.

You can upload 4 kinds of files, and any combination of them at once — the app merges everything by sub-order number:

| File | Where to get it | What it adds |
|---|---|---|
| GST report zip | Payments → Download dropdown → GST report | Sales/return line items, tax amounts |
| Shipping labels | Order PDFs from Meesho | Customer name, address, pincode |
| Orders Excel | Orders → top-right corner → Download order data | Order status (delivered/cancelled/RTO) |
| Order Summary | Payments → Order Summary → Download | Payout value, payout status |

Re-uploading the same file is safe — orders are merged, not duplicated, and an identical Order Summary file uploaded twice is detected and skipped automatically.

## Local setup

**Prerequisites:** Node.js, a local MongoDB running on `mongodb://localhost:27017` (or edit `backend/.env`).

```bash
cd backend
npm install
cp .env.example .env   # then fill in GEMINI_API_KEY for the Ask AI tab to work
npm run dev            # starts on http://localhost:4000

cd ../frontend
npm install
npm run dev             # starts on http://localhost:5173, proxies /api to :4000
```

Open http://localhost:5173 and start uploading from the Upload tab.

## Deploying

- **Backend → Render.** `render.yaml` at the repo root is a ready-to-use Blueprint. Connect the repo on Render, then set `MONGODB_URI` and `GEMINI_API_KEY` in the dashboard (see `backend/.env.example` for what each does).
- **Frontend → Netlify.** Set the `VITE_API_BASE` environment variable to your deployed Render URL (e.g. `https://your-service.onrender.com/api`) — see `frontend/.env.example`. Locally this is left unset since Vite's dev proxy handles it instead.
- Once you know your Netlify URL, set `CORS_ORIGIN` on Render to that domain so the API only accepts requests from your own frontend.

## Notes

- Repeat-customer and scam-risk tags need shipping labels uploaded (they carry name + pincode; the other files alone have no customer identity).
- Scam-risk thresholds (`SCAM_MIN_ORDERS`, `SCAM_LITTLE_THRESHOLD`, `SCAM_TOTAL_THRESHOLD`) are configurable in `backend/.env`.
- Ask AI sends your order/customer data to Google Gemini to answer questions — fine at personal scale (a few hundred orders/month), not designed for large datasets.

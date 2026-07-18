import { useEffect, useRef, useState } from "react";
import { uploadFiles, getBatches, getOrderStats, type UploadBatch, type UploadResult, type OrderStats } from "../api";
import { useLanguage } from "../LanguageContext";
import { bilingual } from "../i18n";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonth(monthNumber?: number, financialYear?: string) {
  if (!monthNumber) return "-";
  const name = MONTH_NAMES[monthNumber - 1] || `Month ${monthNumber}`;
  return financialYear ? `${name} ${financialYear}` : name;
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "-";
}

function fmtMoney(n: number) {
  return `Rs.${n.toFixed(2)}`;
}

function fmtMonth(d: string | null) {
  return d ? new Date(d).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : null;
}

function fmtMonthRange(from: string | null, to: string | null) {
  const a = fmtMonth(from);
  const b = fmtMonth(to);
  if (!a || !b) return null;
  return a === b ? a : `${a} – ${b}`;
}

type BoxStatus = "idle" | "uploading" | "error";

export default function UploadPage() {
  const { lang } = useLanguage();
  const [zip, setZip] = useState<File | null>(null);
  const [labels, setLabels] = useState<File[]>([]);
  const [ordersCsv, setOrdersCsv] = useState<File | null>(null);
  const [orderSummaryCsv, setOrderSummaryCsv] = useState<File | null>(null);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const labelsInputRef = useRef<HTMLInputElement>(null);
  const ordersCsvInputRef = useRef<HTMLInputElement>(null);
  const orderSummaryCsvInputRef = useRef<HTMLInputElement>(null);

  const [zipStatus, setZipStatus] = useState<BoxStatus>("idle");
  const [labelsStatus, setLabelsStatus] = useState<BoxStatus>("idle");
  const [ordersStatus, setOrdersStatus] = useState<BoxStatus>("idle");
  const [orderSummaryStatus, setOrderSummaryStatus] = useState<BoxStatus>("idle");
  const [zipError, setZipError] = useState<string | null>(null);
  const [labelsError, setLabelsError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderSummaryError, setOrderSummaryError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);

  async function loadBatches() {
    try {
      const res = await getBatches();
      setBatches(res.batches);
    } catch {
      // history is a nice-to-have, don't block the upload form on it
    }
  }

  async function loadOrderStats() {
    try {
      setOrderStats(await getOrderStats());
    } catch {
      // overview is a nice-to-have, don't block the upload form on it
    }
  }

  useEffect(() => {
    loadBatches();
    loadOrderStats();
  }, []);

  async function uploadBox(
    args: [File | null, File[], File | null, File | null],
    setStatus: (s: BoxStatus) => void,
    setBoxError: (e: string | null) => void,
    clear: () => void
  ) {
    setStatus("uploading");
    setBoxError(null);
    try {
      const res = await uploadFiles(...args);
      setLastResult(res);
      clear();
      await Promise.all([loadBatches(), loadOrderStats()]);
      setStatus("idle");
    } catch (err) {
      setBoxError(err instanceof Error ? err.message : "Upload failed");
      setStatus("idle");
    }
  }

  const uploadZip = () => uploadBox([zip, [], null, null], setZipStatus, setZipError, () => setZip(null));
  const uploadLabels = () =>
    uploadBox([null, labels, null, null], setLabelsStatus, setLabelsError, () => setLabels([]));
  const uploadOrders = () =>
    uploadBox([null, [], ordersCsv, null], setOrdersStatus, setOrdersError, () => setOrdersCsv(null));
  const uploadOrderSummary = () =>
    uploadBox(
      [null, [], null, orderSummaryCsv],
      setOrderSummaryStatus,
      setOrderSummaryError,
      () => setOrderSummaryCsv(null)
    );

  return (
    <>
      <div className="card">
        <h2>{bilingual("Upload this month's files", "heading.uploadFiles", lang)}</h2>
        <p className="muted">
          Drop in your Meesho zip (tcs_sales.xlsx + tcs_sales_return.xlsx), shipping label PDFs,
          your Orders Excel export, and/or your Order Summary export — we'll merge everything
          automatically. Re-uploading the same files is safe, orders are merged, not duplicated.
        </p>
        <div className="upload-row">
          <div className="dropzone">
            <div className="dropzone-title">GST report zip</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Payments &gt; Download dropdown &gt; GST report
            </div>
            <div className="muted" style={{ marginBottom: 14 }}>
              {zip ? zip.name : "tcs_sales.xlsx + tcs_sales_return.xlsx"}
            </div>
            {zip ? (
              <button type="button" className="primary" disabled={zipStatus === "uploading"} onClick={uploadZip}>
                {zipStatus === "uploading" ? "Uploading..." : "Upload"}
              </button>
            ) : (
              <button type="button" className="primary" onClick={() => zipInputRef.current?.click()}>
                Choose file
              </button>
            )}
            <input
              ref={zipInputRef}
              className="file-input-hidden"
              type="file"
              accept=".zip"
              onChange={(e) => setZip(e.target.files?.[0] || null)}
            />
            {zipError && <p className="warning-text" style={{ marginTop: 10 }}>{zipError}</p>}
          </div>
          <div className="dropzone">
            <div className="dropzone-title">Shipping labels</div>
            <div className="muted" style={{ marginBottom: 14 }}>
              {labels.length > 0 ? `${labels.length} file(s) selected` : "One or more label PDFs"}
            </div>
            {labels.length > 0 ? (
              <button
                type="button"
                className="primary"
                disabled={labelsStatus === "uploading"}
                onClick={uploadLabels}
              >
                {labelsStatus === "uploading" ? "Uploading..." : "Upload"}
              </button>
            ) : (
              <button type="button" className="ghost" onClick={() => labelsInputRef.current?.click()}>
                Choose files
              </button>
            )}
            <input
              ref={labelsInputRef}
              className="file-input-hidden"
              type="file"
              accept=".pdf"
              multiple
              onChange={(e) => setLabels(Array.from(e.target.files || []))}
            />
            {batches.length > 0 && (
              <p className="muted" style={{ marginTop: 10 }}>
                {batches.reduce((sum, b) => sum + b.labelFileNames.length, 0)} labels uploaded total
              </p>
            )}
            {labelsError && <p className="warning-text" style={{ marginTop: 10 }}>{labelsError}</p>}
          </div>
          <div className="dropzone">
            <div className="dropzone-title">Orders Excel</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Orders &gt; top-right corner &gt; Download order data
            </div>
            <div className="muted" style={{ marginBottom: 14 }}>
              {ordersCsv ? ordersCsv.name : "Product name, catalog id, status, etc."}
            </div>
            {ordersCsv ? (
              <button
                type="button"
                className="primary"
                disabled={ordersStatus === "uploading"}
                onClick={uploadOrders}
              >
                {ordersStatus === "uploading" ? "Uploading..." : "Upload"}
              </button>
            ) : (
              <button type="button" className="ghost" onClick={() => ordersCsvInputRef.current?.click()}>
                Choose file
              </button>
            )}
            <input
              ref={ordersCsvInputRef}
              className="file-input-hidden"
              type="file"
              accept=".csv"
              onChange={(e) => setOrdersCsv(e.target.files?.[0] || null)}
            />
            {ordersError && <p className="warning-text" style={{ marginTop: 10 }}>{ordersError}</p>}
          </div>
          <div className="dropzone">
            <div className="dropzone-title">Order Summary</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Payments &gt; Order Summary &gt; Download
            </div>
            <div className="muted" style={{ marginBottom: 14 }}>
              {orderSummaryCsv ? orderSummaryCsv.name : "Price, payout value, payout status"}
            </div>
            {orderSummaryCsv ? (
              <button
                type="button"
                className="primary"
                disabled={orderSummaryStatus === "uploading"}
                onClick={uploadOrderSummary}
              >
                {orderSummaryStatus === "uploading" ? "Uploading..." : "Upload"}
              </button>
            ) : (
              <button type="button" className="ghost" onClick={() => orderSummaryCsvInputRef.current?.click()}>
                Choose file
              </button>
            )}
            <input
              ref={orderSummaryCsvInputRef}
              className="file-input-hidden"
              type="file"
              accept=".csv"
              onChange={(e) => setOrderSummaryCsv(e.target.files?.[0] || null)}
            />
            {orderSummaryError && <p className="warning-text" style={{ marginTop: 10 }}>{orderSummaryError}</p>}
          </div>
        </div>

        {lastResult && (
          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ marginBottom: 4 }}>
              Upload complete — see the summary below.
            </p>
            {lastResult.warnings.length > 0 && (
              <ul className="warning-text">
                {lastResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {orderStats && orderStats.totalOrders > 0 && (
        <div className="card">
          <h2>{bilingual("Order overview", "heading.orderOverview", lang)}</h2>
          <p className="muted">
            All uploaded orders, {fmtDate(orderStats.earliestOrderDate)} – {fmtDate(orderStats.latestOrderDate)}. Every
            order is counted exactly once below, so these add up to your total.
          </p>
          <div className="summary-grid">
            <div className="stat c-sky">
              <div className="stat-num">{orderStats.totalOrders}</div>
              <div className="stat-label">total orders</div>
            </div>
            <div
              className="stat"
              title="Sum of the Payout Value column (Order Summary export) for every order marked Payout Status = SETTLED — includes negative-settled returns, so this is net money received, not gross sales. Updates as soon as you upload Order Summary data, independent of the Orders Excel export."
            >
              <div className="stat-num">{fmtMoney(orderStats.settledRevenue)}</div>
              <div className="stat-label">money made (settled) ⓘ</div>
              {fmtMonthRange(orderStats.settledRevenueFrom, orderStats.settledRevenueTo) && (
                <div className="stat-label" style={{ marginTop: 2, opacity: 0.8 }}>
                  for {fmtMonthRange(orderStats.settledRevenueFrom, orderStats.settledRevenueTo)}
                </div>
              )}
            </div>
            <div className="stat c-mint">
              <div className="stat-num">{orderStats.exclusive.delivered}</div>
              <div className="stat-label">delivered</div>
              <div className="stat-num" style={{ fontSize: 16, marginTop: 6 }}>
                {fmtMoney(orderStats.exclusive.deliveredRevenue)}
              </div>
            </div>
            <div className="stat c-coral">
              <div className="stat-num">{orderStats.exclusive.returned}</div>
              <div className="stat-label">returned</div>
              <div className="stat-num" style={{ fontSize: 16, marginTop: 6 }}>
                {fmtMoney(orderStats.exclusive.returnedRevenue)}
              </div>
            </div>
            <div className="stat c-peach">
              <div className="stat-num">{orderStats.exclusive.rto}</div>
              <div className="stat-label">RTO</div>
            </div>
            <div className="stat c-rose">
              <div className="stat-num">{orderStats.exclusive.cancelled}</div>
              <div className="stat-label">cancelled</div>
            </div>
            {orderStats.exclusive.other > 0 && (
              <div className="stat">
                <div className="stat-num">{orderStats.exclusive.other}</div>
                <div className="stat-label">no status/return data yet</div>
              </div>
            )}
          </div>
        </div>
      )}

      {(() => {
        const gstBatches = batches.filter((b) => b.zipFileName);
        const labelBatches = batches.filter((b) => b.labelFileNames.length > 0);
        const ordersBatches = batches.filter((b) => b.ordersCsvFileName);
        const orderSummaryBatches = batches.filter((b) => b.orderSummaryCsvFileName);
        const monthCell = (b: UploadBatch) =>
          b.monthNumber
            ? formatMonth(b.monthNumber, b.financialYear)
            : fmtMonthRange(b.earliestOrderDate ?? null, b.latestOrderDate ?? null) || "-";

        return (
          <>
            <div className="card">
              <h2>GST report uploads</h2>
              {gstBatches.length === 0 ? (
                <p className="muted">No uploads yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Month</th>
                      <th>Zip</th>
                      <th>Sales rows</th>
                      <th>Return rows</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstBatches.map((b) => (
                      <tr key={b._id}>
                        <td data-label="Date">{new Date(b.uploadedAt).toLocaleString()}</td>
                        <td data-label="Month">{monthCell(b)}</td>
                        <td data-label="Zip">{b.zipFileName || "-"}</td>
                        <td data-label="Sales rows">{b.salesRowsParsed}</td>
                        <td data-label="Return rows">{b.returnRowsParsed}</td>
                        <td data-label="Status">{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <h2>Shipping label uploads</h2>
              {labelBatches.length === 0 ? (
                <p className="muted">No uploads yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Labels</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labelBatches.map((b) => (
                      <tr key={b._id}>
                        <td data-label="Date">{new Date(b.uploadedAt).toLocaleString()}</td>
                        <td data-label="Labels">{b.labelFileNames.length}</td>
                        <td data-label="Status">{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <h2>Orders Excel uploads</h2>
              {ordersBatches.length === 0 ? (
                <p className="muted">No uploads yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Month</th>
                      <th>Orders Excel rows</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersBatches.map((b) => (
                      <tr key={b._id}>
                        <td data-label="Date">{new Date(b.uploadedAt).toLocaleString()}</td>
                        <td data-label="Month">{monthCell(b)}</td>
                        <td data-label="Orders Excel rows">{b.orderInfoRowsParsed}</td>
                        <td data-label="Status">{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <h2>Order Summary uploads</h2>
              {orderSummaryBatches.length === 0 ? (
                <p className="muted">No uploads yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Month</th>
                      <th>Payout rows</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderSummaryBatches.map((b) => (
                      <tr key={b._id}>
                        <td data-label="Date">{new Date(b.uploadedAt).toLocaleString()}</td>
                        <td data-label="Month">{monthCell(b)}</td>
                        <td data-label="Payout rows">{b.payoutRowsParsed}</td>
                        <td data-label="Status">{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        );
      })()}
    </>
  );
}

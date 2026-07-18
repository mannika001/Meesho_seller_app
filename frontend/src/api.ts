// In dev, Vite proxies "/api" to localhost:4000 (see vite.config.ts), so the
// relative path works with no env var needed. In production (Netlify), there
// is no backend on the same origin to proxy to, so VITE_API_BASE must point
// at the deployed Render URL, e.g. https://your-service.onrender.com/api.
const BASE = import.meta.env.VITE_API_BASE || "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }
  return data;
}

export interface Order {
  _id: string;
  subOrderNum: string;
  gst?: {
    supName?: string;
    gstin?: string;
    orderDate?: string;
    hsnCode?: string;
    quantity?: number;
    gstRate?: number;
    totalTaxableSaleValue?: number;
    taxAmount?: number;
    totalInvoiceValue?: number;
    taxableShipping?: number;
    endCustomerStateNew?: string;
    enrollmentNo?: string;
    manifestDate?: string;
    transactionType?: string;
    ecoTcsGstin?: string;
    financialYear?: string;
    monthNumber?: number;
    supplierId?: string;
  };
  returnInfo?: {
    cancelReturnDate?: string;
  };
  orderInfo?: {
    orderStatus?: string;
    catalogId?: string;
    orderSource?: string;
    productName?: string;
    packetId?: string;
    supplierListedPrice?: number;
    supplierDiscountedPrice?: number;
  };
  label?: {
    customerName?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    courierName?: string;
    awb?: string;
    sku?: string;
    size?: string;
    color?: string;
  };
  payout?: {
    catalogId?: string;
    quantity?: number;
    price?: number;
    payoutValue?: number;
    payoutStatus?: string;
  };
  isReturned: boolean;
  customerKey?: string;
  customer?: Pick<Customer, "isRepeat" | "returnRate" | "scamTag"> | null;
}

export interface Customer {
  _id: string;
  customerKey: string;
  displayName: string;
  address: string;
  state: string;
  pincode: string;
  totalOrders: number;
  returnedOrders: number;
  returnRate: number;
  isRepeat: boolean;
  scamTag: "none" | "little_scammy" | "total_scammy" | "not_enough_data";
}

export interface UploadBatch {
  _id: string;
  zipFileName?: string;
  labelFileNames: string[];
  ordersCsvFileName?: string;
  orderSummaryCsvFileName?: string;
  monthNumber?: number;
  financialYear?: string;
  earliestOrderDate?: string;
  latestOrderDate?: string;
  salesRowsParsed: number;
  returnRowsParsed: number;
  labelPagesParsed: number;
  orderInfoRowsParsed: number;
  payoutRowsParsed: number;
  ordersUpserted: number;
  ordersUpdated: number;
  ordersUnmatchedLabel: number;
  warnings: string[];
  status: string;
  uploadedAt: string;
}

export interface UploadResult {
  batchId: string;
  ordersUpserted: number;
  ordersUpdated: number;
  ordersUnmatchedLabel: number;
  warnings: string[];
}

export async function uploadFiles(
  zip: File | null,
  labels: File[],
  ordersCsv: File | null = null,
  orderSummaryCsv: File | null = null
): Promise<UploadResult> {
  const formData = new FormData();
  if (zip) formData.append("zip", zip);
  labels.forEach((f) => formData.append("labels", f));
  if (ordersCsv) formData.append("ordersCsv", ordersCsv);
  if (orderSummaryCsv) formData.append("orderSummaryCsv", orderSummaryCsv);
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Upload failed: ${res.status}`);
  }
  return data;
}

export function getBatches() {
  return request<{ batches: UploadBatch[] }>("/upload/batches");
}

export function getOrders(
  params: {
    returned?: boolean;
    orderStatus?: string;
    customerKey?: string;
    page?: number;
    limit?: number;
    q?: string;
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.returned !== undefined) qs.set("returned", String(params.returned));
  if (params.orderStatus) qs.set("orderStatus", params.orderStatus);
  if (params.customerKey) qs.set("customerKey", params.customerKey);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.q) qs.set("q", params.q);
  const query = qs.toString();
  return request<{ orders: Order[]; total: number }>(`/orders${query ? `?${query}` : ""}`);
}

export interface OrderStats {
  totalOrders: number;
  delivered: number;
  cancelled: number;
  rto: number;
  returned: number;
  settledRevenue: number;
  settledRevenueFrom: string | null;
  settledRevenueTo: string | null;
  earliestOrderDate: string | null;
  latestOrderDate: string | null;
  // Mutually-exclusive breakdown that sums to totalOrders, unlike the fields
  // above (delivered/cancelled/rto/returned overlap — e.g. an RTO order can
  // also be marked isReturned from the GST returns sheet).
  exclusive: {
    delivered: number;
    deliveredRevenue: number;
    cancelled: number;
    rto: number;
    returned: number;
    returnedRevenue: number;
    other: number;
  };
}

export function getOrderStats() {
  return request<OrderStats>("/orders/stats");
}

export function getCustomers(tag?: string) {
  const qs = tag ? `?tag=${encodeURIComponent(tag)}` : "";
  return request<{ customers: Customer[]; total: number }>(`/customers${qs}`);
}

export interface Product {
  catalogId: string;
  productName?: string;
  sku?: string;
  totalOrders: number;
  totalQuantity: number;
  totalTaxableValue: number;
  totalTaxAmount: number;
  totalInvoiceValue: number;
  totalListedPrice: number;
  totalDiscountedPrice: number;
  totalOrderValue: number;
  totalPayoutValue: number;
}

export function getProducts() {
  return request<{ products: Product[] }>("/products");
}

export interface ChatToolResult {
  tool: "get_stats" | "search_orders" | "search_customers";
  result: any;
}

export interface ChatCall {
  tool: "get_stats" | "search_orders" | "search_customers";
  args: Record<string, unknown>;
}

export type ChatPlanResult =
  | { question: string; needsData: false; answer: string }
  | { question: string; needsData: true; calls: ChatCall[]; summary: string };

export function planChat(question: string) {
  return request<ChatPlanResult>("/chat/plan", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export function confirmChat(question: string, calls: ChatCall[]) {
  return request<{ answer: string; data?: ChatToolResult[] }>("/chat/confirm", {
    method: "POST",
    body: JSON.stringify({ question, calls }),
  });
}

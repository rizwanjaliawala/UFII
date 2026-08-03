import type { Container } from "@tms/shared";

/**
 * Typed API client.
 *
 * The single seam between the UI and the backend. Modules depend on these
 * signatures, not on how the data is sourced — so when the credential-free
 * CSV reader is replaced by the authenticated TMS Master adapter, nothing in
 * the UI changes.
 */

export class ApiError extends Error {
  // Declared explicitly rather than as a constructor parameter property —
  // the client compiles with `erasableSyntaxOnly`, which forbids those.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check that the API is running.", 0);
  }

  if (!response.ok) {
    // Surface the server's message when it sends one; never a raw status code.
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

/* ---------------- Containers ---------------- */

export interface ContainerFilters {
  q?: string;
  trucker?: string;
  ssl?: string;
  terminal?: string;
  pod?: string;
  status?: string;
  risk?: string;
  sort?: "urgency" | "lfd" | "container" | "eta" | "updated";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface SourceStats {
  containers: number;
  tabsRead: number;
  rowsRead: number;
  skipped: number;
  loadedAt: string;
  cached: boolean;
}

export interface ContainerPage {
  rows: Container[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  source: SourceStats | null;
}

export interface FilterOption {
  value: string;
  count: number;
}

export interface FilterOptions {
  truckers: FilterOption[];
  ssls: FilterOption[];
  terminals: FilterOption[];
  pods: FilterOption[];
  statuses: FilterOption[];
  total: number;
}

export interface ContainerSummary {
  total: number;
  risk: Record<string, number>;
  status: Record<string, number>;
  source: SourceStats | null;
}

function toQueryString(filters: ContainerFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const api = {
  listContainers: (filters: ContainerFilters = {}): Promise<ContainerPage> =>
    request(`/containers${toQueryString(filters)}`),

  getContainer: (
    containerNumber: string,
  ): Promise<{ container: Container; related: Container[] }> =>
    request(`/containers/${encodeURIComponent(containerNumber)}`),

  getFilterOptions: (): Promise<FilterOptions> => request("/containers/filters"),

  getSummary: (): Promise<ContainerSummary> => request("/containers/summary"),

  refreshContainers: (): Promise<{ ok: boolean; containers: number; ms: number }> =>
    request("/containers/refresh", { method: "POST" }),

  /**
   * Edit a container's user-owned fields.
   *
   * The edit key travels in a header, not the body, so it never lands in a
   * request log that records payloads. The server is what validates it.
   */
  editContainer: (
    containerNumber: string,
    changes: ContainerEdit,
    editKey: string,
  ): Promise<{ ok: boolean; container: Container }> =>
    request(`/containers/${encodeURIComponent(containerNumber)}`, {
      method: "PATCH",
      headers: { "x-edit-key": editKey },
      body: JSON.stringify(changes),
    }),

  getContainerHistory: (
    containerNumber: string,
  ): Promise<{ entries: AuditEntry[] }> =>
    request(`/containers/${encodeURIComponent(containerNumber)}/history`),

  getDashboard: (): Promise<DashboardSummary> => request("/dashboard"),

  getVendors: (): Promise<VendorSummary> => request("/vendors"),

  getContainerCharges: (containerNumber: string): Promise<ContainerCharges> =>
    request(`/vendors/container/${encodeURIComponent(containerNumber)}/charges`),

  getAlerts: (): Promise<AlertSummary> => request("/alerts"),

  /**
   * Download URLs, not fetches.
   *
   * The browser follows these directly so the file streams to disk with the
   * server's filename. Filters are carried through verbatim — an export must
   * contain exactly what the operator has on screen.
   */
  containersExportUrl: (filters: ContainerFilters = {}): string =>
    `/api/containers/export${toQueryString(filters)}`,

  vendorsExportUrl: (): string => "/api/vendors/export",

  globalSearch: (q: string): Promise<GlobalSearchResult> =>
    request(`/search?q=${encodeURIComponent(q)}`),

  getVendorDetail: (key: string): Promise<VendorDetail> =>
    request(`/vendors/${encodeURIComponent(key)}`),

  getDetention: (filters: DetentionFilters = {}): Promise<DetentionSummary> =>
    request(`/detention${toQueryString(filters)}`),

  detentionExportUrl: (filters: DetentionFilters = {}): string =>
    `/api/detention/export${toQueryString(filters)}`,
};

/* ---------------- Detention & Demurrage ---------------- */

export interface DetentionFilters {
  q?: string;
  responsibleParty?: string;
  chargeType?: string;
  limit?: number;
}

export interface DetentionSummary {
  generatedAt: string;
  available: boolean;
  totals: {
    invoices: number;
    invoiceLines: number;
    charged: number;
    credited: number;
    net: number;
    fbu: number;
    unmatchedCreditNotes: number;
  };
  byChargeType: { type: string; count: number; amount: number }[];
  byResponsibleParty: { name: string; invoices: number; amount: number }[];
  invoices: {
    invoiceNumber: string;
    totalAmount: number;
    containers: number;
    chargeTypes: string[];
    responsibleParty: string | null;
    trucker: string | null;
    paymentStatus: string | null;
    earliestPickUp: string | null;
    latestReturn: string | null;
  }[];
  creditNotes: {
    creditNoteNumber: string | null;
    containerNumber: string | null;
    amount: number;
    company: string | null;
    reason: string | null;
    status: string | null;
  }[];
  fbuCharges: {
    invoiceNumber: string | null;
    containerNumber: string | null;
    amount: number;
    trucker: string | null;
    chargeType: string | null;
  }[];
}

export interface VendorTrendPoint {
  month: string;
  containers: number;
  onTimeRate: number | null;
  onTimeSample: number;
  ddCost: number;
}

export interface VendorDetail {
  kpi: VendorKpi | null;
  trend: VendorTrendPoint[];
  terminals: { name: string; count: number }[];
  recentInvoices: {
    invoiceNumber: string;
    amount: number;
    containers: number;
    responsibleParty: string | null;
    paymentStatus: string | null;
  }[];
}

/* ---------------- Global search ---------------- */

export interface SearchHit {
  kind: "container" | "vendor" | "invoice";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface GlobalSearchResult {
  q: string;
  hits: SearchHit[];
  truncated: boolean;
}

/* ---------------- Dashboard ---------------- */

export interface DashboardSummary {
  generatedAt: string;
  source: { kind: "sheets" | "neon"; containers: number; loadedAt: string | null };
  kpis: {
    activeContainers: number;
    atPort: number;
    inTransit: number;
    completed: number;
    arrivingToday: number;
    appointmentsToday: number;
    lfdDueToday: number;
    overdue: number;
  };
  risk: Record<string, number>;
  attention: {
    id: string;
    label: string;
    count: number;
    severity: "critical" | "warning" | "info";
    hint: string;
    href: string;
  }[];
  lfdBoard: {
    containerNumber: string;
    lastFreeDay: string | null;
    daysRemaining: number | null;
    risk: string;
    trucker: string | null;
    terminal: string | null;
  }[];
  byTerminal: { name: string; total: number; atRisk: number }[];
  byPod: { name: string; total: number; atRisk: number }[];
  byTrucker: { name: string; total: number; atRisk: number; active: number }[];
  upcoming: { date: string; label: string; count: number }[];
  unavailable: { module: string; reason: string; phase: string }[];
}

/* ---------------- Vendors ---------------- */

export interface VendorKpi {
  name: string;
  key: string;
  activeContainers: number;
  totalContainers: number;
  completed: number;
  onTimePickupRate: number | null;
  onTimeSample: number;
  atRisk: number;
  overdue: number;
  ddCostResponsible: number;
  ddCostAsTrucker: number;
  invoiceCount: number;
  creditNoteTotal: number;
  score: number | null;
}

export interface VendorSummary {
  generatedAt: string;
  source: "sheets" | "neon";
  vendors: VendorKpi[];
  totals: { vendors: number; ddCost: number; credits: number };
  unavailable: { metric: string; reason: string; phase: string }[];
}

export interface ContainerCharges {
  containerNumber: string;
  available: boolean;
  lines: {
    invoiceNumber: string;
    chargeType: string;
    amount: number;
    days: number | null;
    pickUpDate: string | null;
    returnDate: string | null;
    lastFreeDay: string | null;
    responsibleParty: string | null;
    trucker: string | null;
    paymentStatus: string | null;
    remarks: string | null;
  }[];
  creditNotes: {
    amount: number;
    company: string | null;
    reason: string | null;
    status: string | null;
    creditNoteNumber: string | null;
  }[];
  fbuCharges: {
    invoiceNumber: string | null;
    amount: number;
    trucker: string | null;
    chargeType: string | null;
  }[];
  totals: { charged: number; credited: number; net: number };
}

/* ---------------- Alerts ---------------- */

export interface AlertRow {
  containerNumber: string;
  lastFreeDay: string | null;
  daysRemaining: number | null;
  appointmentDate: string | null;
  trucker: string | null;
  terminal: string | null;
  status: string;
}

export interface AlertGroup {
  id: string;
  label: string;
  description: string;
  severity: "critical" | "warning" | "info";
  action: string;
  count: number;
  rows: AlertRow[];
}

export interface AlertSummary {
  generatedAt: string;
  source: "sheets" | "neon";
  groups: AlertGroup[];
  totals: { critical: number; warning: number; info: number; containers: number };
  unmeasurable: { label: string; reason: string; phase: string }[];
  reminders: { available: boolean; reason: string; phase: string };
}

export interface ContainerEdit {
  status?: Container["status"];
  pickupNumber?: string | null;
  internalNotes?: string | null;
  dispatchNotes?: string | null;
  vendorNotes?: string | null;
  assignedDispatcher?: string | null;
  priority?: Container["priority"];
  reason?: string;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
}

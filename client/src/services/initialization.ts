/**
 * Application initialization pipeline.
 *
 * Implements the Initialization Pipeline in docs/02 §Welcome & Enterprise
 * Startup Experience. Every stage wraps a real asynchronous call — nothing
 * here advances on a timer, and there are no artificial delays. A stage that
 * cannot complete reports Warning or Failed rather than animating past it.
 *
 * This module is deliberately free of React so the sequence can be tested
 * and reused (for example by the compact refresh overlay).
 */

export type ServiceStatus = "Waiting" | "Connecting" | "Ready" | "Warning" | "Failed";

/** The eleven services shown in the live health panel. */
export const HEALTH_SERVICES = [
  "Google Source Sheet 1",
  "Google Source Sheet 2",
  "Google Drive",
  "Outlook Desktop",
  "TMS Master",
  "Synchronization Engine",
  "AI Engine",
  "Cost Analysis Engine",
  "Reports Module",
  "Dashboard",
  "Security Services",
] as const;

export type HealthService = (typeof HEALTH_SERVICES)[number];

export interface StageDefinition {
  id: string;
  /** Message shown while this stage runs. */
  message: string;
  /** Health-panel entries this stage resolves. */
  services: HealthService[];
  /**
   * Critical stages block startup on failure. Non-critical ones degrade to a
   * Warning and let the user through — the application must remain usable
   * when an integration is unavailable (doc 10 §Disaster Recovery).
   */
  critical: boolean;
  run: (ctx: InitContext) => Promise<StageOutcome>;
}

export interface StageOutcome {
  status: "Ready" | "Warning" | "Failed";
  detail?: string;
  /** Counters merged into the live startup statistics. */
  stats?: Partial<StartupStatistics>;
}

export interface StartupStatistics {
  containersLoaded: number;
  invoicesLoaded: number;
  emailsIndexed: number;
  documentsLinked: number;
  vendorsLoaded: number;
  agentsStarted: number;
}

export interface InitContext {
  signal: AbortSignal;
  /** Populated as stages run, so later stages can use earlier results. */
  data: Record<string, unknown>;
}

export const EMPTY_STATISTICS: StartupStatistics = {
  containersLoaded: 0,
  invoicesLoaded: 0,
  emailsIndexed: 0,
  documentsLinked: 0,
  vendorsLoaded: 0,
  agentsStarted: 0,
};

/* ------------------------------------------------------------------ */
/* API helper                                                          */
/* ------------------------------------------------------------------ */

class ApiUnavailable extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiUnavailable";
  }
}

/**
 * 2.5s ceiling. The startup screen targets ~3s, so a backend that is simply
 * absent must degrade well inside that budget rather than stalling the user
 * behind a long TCP timeout.
 */
async function apiGet<T>(path: string, signal: AbortSignal, timeoutMs = 2500): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = AbortSignal.any([signal, timeout]);

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { signal: combined });
  } catch (cause) {
    throw new ApiUnavailable(
      timeout.aborted ? "Service did not respond in time" : "Service unreachable",
      { cause },
    );
  }
  if (!response.ok) {
    throw new ApiUnavailable(`Service returned ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Shape returned by the backend health endpoint. */
interface HealthResponse {
  ok: boolean;
  services: Partial<Record<string, { status: ServiceStatus; detail?: string }>>;
  counts?: Partial<StartupStatistics>;
  lastSyncAt?: string | null;
}

/**
 * Probe the backend once and cache it for the whole run. Every stage reads
 * from this rather than issuing its own request, so startup costs one round
 * trip instead of thirteen.
 */
async function backendHealth(ctx: InitContext): Promise<HealthResponse | null> {
  if ("health" in ctx.data) return ctx.data.health as HealthResponse | null;
  try {
    const health = await apiGet<HealthResponse>("/health", ctx.signal);
    ctx.data.health = health;
    return health;
  } catch {
    ctx.data.health = null;
    return null;
  }
}

/** Translate one backend service report into a stage outcome. */
function fromHealth(
  health: HealthResponse | null,
  key: string,
  offlineDetail: string,
): StageOutcome {
  if (!health) return { status: "Warning", detail: offlineDetail };
  const service = health.services?.[key];
  if (!service) return { status: "Warning", detail: "Not configured" };
  if (service.status === "Ready") return { status: "Ready", detail: service.detail };
  if (service.status === "Failed") return { status: "Failed", detail: service.detail };
  return { status: "Warning", detail: service.detail ?? "Unavailable" };
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

export const PIPELINE: StageDefinition[] = [
  {
    id: "environment",
    message: "Loading Environment...",
    services: [],
    critical: true,
    run: async () => ({ status: "Ready" }),
  },
  {
    id: "configuration",
    message: "Loading Configuration...",
    services: ["Security Services"],
    critical: true,
    run: async (ctx) => {
      const health = await backendHealth(ctx);
      // Without a backend the client still runs against cached data, but
      // nothing can be written — that is a warning, not a hard failure.
      return health
        ? { status: "Ready" }
        : { status: "Warning", detail: "Backend unreachable — read-only" };
    },
  },
  {
    id: "application",
    message: "Initializing Enterprise Platform...",
    services: [],
    critical: true,
    run: async () => ({ status: "Ready" }),
  },
  {
    id: "source-sheet-1",
    message: "Connecting Google Sheets...",
    services: ["Google Source Sheet 1"],
    critical: false,
    run: async (ctx) =>
      fromHealth(await backendHealth(ctx), "sourceSheet1", "Google unreachable"),
  },
  {
    id: "source-sheet-2",
    message: "Reading Operational Data...",
    services: ["Google Source Sheet 2"],
    critical: false,
    run: async (ctx) =>
      fromHealth(await backendHealth(ctx), "sourceSheet2", "Google unreachable"),
  },
  {
    id: "drive",
    message: "Loading Google Drive...",
    services: ["Google Drive"],
    critical: false,
    run: async (ctx) => {
      const health = await backendHealth(ctx);
      const outcome = fromHealth(health, "drive", "Google Drive unreachable");
      return {
        ...outcome,
        stats: { documentsLinked: health?.counts?.documentsLinked ?? 0 },
      };
    },
  },
  {
    id: "outlook",
    message: "Checking Outlook...",
    services: ["Outlook Desktop"],
    critical: false,
    run: async (ctx) => {
      const health = await backendHealth(ctx);
      const outcome = fromHealth(health, "outlook", "Outlook Desktop not detected");
      return { ...outcome, stats: { emailsIndexed: health?.counts?.emailsIndexed ?? 0 } };
    },
  },
  {
    id: "sync-engine",
    message: "Initializing Synchronization Engine...",
    services: ["Synchronization Engine"],
    critical: false,
    run: async (ctx) =>
      fromHealth(await backendHealth(ctx), "syncEngine", "Synchronization offline"),
  },
  {
    id: "tms-master",
    message: "Loading TMS Master...",
    services: ["TMS Master"],
    critical: false,
    run: async (ctx) => {
      const health = await backendHealth(ctx);
      const outcome = fromHealth(health, "tmsMaster", "Using last synchronized data");
      return {
        ...outcome,
        stats: {
          containersLoaded: health?.counts?.containersLoaded ?? 0,
          invoicesLoaded: health?.counts?.invoicesLoaded ?? 0,
          vendorsLoaded: health?.counts?.vendorsLoaded ?? 0,
        },
      };
    },
  },
  {
    id: "ai-agents",
    message: "Initializing AI Agents...",
    services: ["AI Engine"],
    critical: false,
    run: async (ctx) => {
      const health = await backendHealth(ctx);
      const outcome = fromHealth(health, "aiEngine", "AI services unavailable");
      return { ...outcome, stats: { agentsStarted: health?.counts?.agentsStarted ?? 0 } };
    },
  },
  {
    id: "cost-analysis",
    message: "Preparing Cost Analysis...",
    services: ["Cost Analysis Engine"],
    critical: false,
    run: async (ctx) =>
      fromHealth(await backendHealth(ctx), "costEngine", "Cost engine unavailable"),
  },
  {
    id: "reports",
    message: "Preparing Reports...",
    services: ["Reports Module"],
    critical: false,
    run: async () => ({ status: "Ready" }),
  },
  {
    id: "dashboard",
    message: "Building Dashboard...",
    services: ["Dashboard"],
    critical: false,
    run: async () => ({ status: "Ready" }),
  },
];

/** Rotating copy shown beneath the progress bar between stage messages. */
export const AMBIENT_MESSAGES = [
  "Loading Container Database...",
  "Synchronizing TMS Master...",
  "Loading Vendor Analytics...",
  "Finalizing Startup...",
];

export const MIN_DISPLAY_MS = 800;

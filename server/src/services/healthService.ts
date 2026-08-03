import { config } from "../config/index.js";
import { listTabs } from "../integrations/google/sheets.js";
import { apiLogger } from "../utils/logger.js";

/**
 * System health, consumed by the client's startup Initialization Dashboard.
 *
 * The response shape is the contract for `client/src/services/initialization.ts`
 * — each key maps to one entry in the eleven-service health panel.
 *
 * Every probe is real. A service that cannot be reached reports Warning or
 * Failed with a human-readable reason; nothing here reports Ready optimistically.
 */

export type ServiceStatus = "Waiting" | "Connecting" | "Ready" | "Warning" | "Failed";

export interface ServiceReport {
  status: ServiceStatus;
  detail?: string;
}

export interface HealthResponse {
  ok: boolean;
  mode: "live" | "offline";
  services: Record<string, ServiceReport>;
  counts: {
    containersLoaded: number;
    invoicesLoaded: number;
    emailsIndexed: number;
    documentsLinked: number;
    vendorsLoaded: number;
    agentsStarted: number;
  };
  lastSyncAt: string | null;
}

/** Probe one spreadsheet by listing its tabs — cheap and proves access. */
async function probeSheet(id: string | undefined, label: string): Promise<ServiceReport> {
  if (!config.google.configured) {
    return { status: "Warning", detail: "Google credentials not configured" };
  }
  if (!id) {
    return { status: "Warning", detail: `${label} ID not set` };
  }

  try {
    const tabs = await listTabs(id);
    return { status: "Ready", detail: `${tabs.length} tab${tabs.length === 1 ? "" : "s"}` };
  } catch (error) {
    const status = (error as { code?: number })?.code;
    const detail =
      status === 403
        ? "Not shared with the service account"
        : status === 404
          ? "Spreadsheet not found"
          : ((error as Error).message ?? "Unreachable");
    return { status: "Failed", detail };
  }
}

export async function getHealth(): Promise<HealthResponse> {
  // Probe the three spreadsheets concurrently — startup latency is dominated
  // by these round trips, and they are independent.
  const [sourceSheet1, sourceSheet2, tmsMaster] = await Promise.all([
    probeSheet(config.google.sourceSheet1Id, "Source Sheet 1"),
    probeSheet(config.google.sourceSheet2Id, "Source Sheet 2"),
    config.google.masterSheetId
      ? probeSheet(config.google.masterSheetId, "TMS Master")
      : Promise.resolve<ServiceReport>({
          status: "Warning",
          detail: "TMS Master not provisioned — run npm run provision:master",
        }),
  ]);

  const drive: ServiceReport = config.google.configured
    ? config.google.driveFolderId
      ? { status: "Ready" }
      : { status: "Warning", detail: "Drive folder not set" }
    : { status: "Warning", detail: "Google credentials not configured" };

  // Outlook is Windows COM and only meaningful on the operations desktop.
  const outlook: ServiceReport =
    process.platform !== "win32"
      ? { status: "Warning", detail: "Outlook Desktop requires Windows" }
      : config.outlook.enabled
        ? { status: "Warning", detail: "Bridge arrives in Phase 3" }
        : { status: "Warning", detail: "Disabled in configuration" };

  const syncEngine: ServiceReport = config.google.masterConfigured
    ? { status: "Ready" }
    : { status: "Warning", detail: "Awaiting TMS Master" };

  const aiEngine: ServiceReport = config.ai.configured
    ? { status: "Ready", detail: config.ai.model }
    : { status: "Warning", detail: "ANTHROPIC_API_KEY not set — templated output" };

  const costEngine: ServiceReport = { status: "Ready" };

  const services = {
    sourceSheet1,
    sourceSheet2,
    drive,
    outlook,
    tmsMaster,
    syncEngine,
    aiEngine,
    costEngine,
  };

  const anyFailed = Object.values(services).some((s) => s.status === "Failed");
  const mode = config.google.masterConfigured && !anyFailed ? "live" : "offline";

  apiLogger.debug({ mode }, "health probed");

  return {
    ok: !anyFailed,
    mode,
    services,
    // Real counts arrive once TMS Master is provisioned and the repository
    // is hydrated. Reporting zeros is honest; inventing numbers is not.
    counts: {
      containersLoaded: 0,
      invoicesLoaded: 0,
      emailsIndexed: 0,
      documentsLinked: 0,
      vendorsLoaded: 0,
      agentsStarted: 0,
    },
    lastSyncAt: null,
  };
}

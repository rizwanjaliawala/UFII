import {
  normalizeContainerNumber,
  normalizeDate,
  normalizeName,
  normalizeNullable,
  isValidContainerNumber,
  type Container,
  type ContainerStatus,
} from "@tms/shared";
import { config, requireSourceSheetId } from "../config/index.js";
import { syncLogger } from "../utils/logger.js";
import { query } from "../db/pool.js";
import {
  CsvSourceReader,
  buildHeaderIndex,
  cell,
  type SourceReader,
} from "../integrations/google/csvSource.js";

/**
 * Container read model, built from Source Sheet 1.
 *
 * Source Sheet 1 is 14 monthly tabs, not one table, and the schema drifted
 * from 18 to 21 columns as fields were added. Everything here therefore maps
 * by HEADER NAME and unions the tabs — verified by `npm run profile:sheets`.
 *
 * This is a READ model. Nothing is written back; TMS Master writes wait on the
 * service account.
 */

/**
 * Header aliases per field.
 *
 * Alternatives are listed because older tabs use different wording. An
 * unmatched header is ignored rather than guessed at.
 */
const SHEET1_ALIASES: Record<string, string[]> = {
  containerNumber: ["container no", "container", "container #", "container number"],
  blNumber: ["mbl no", "mbl", "bl no", "bl number", "master bl"],
  pod: ["pod", "port of discharge"],
  terminal: ["port/terminal", "port / terminal", "terminal", "port"],
  ssl: ["ssl", "steamship line", "line", "carrier"],
  fc: ["fc", "fc code", "freight control"],
  appointmentDate: ["appointment time", "appointment date", "appointment", "appt"],
  isa: ["isa no", "isa", "isa number"],
  trucker: ["trucker", "vendor", "carrier vendor", "drayage"],
  status: ["container status", "status"],
  appointmentStatus: ["appointment status", "appt status"],
  eta: ["eta", "vessel eta"],
  lastFreeDay: ["lfd", "last free day", "free day"],
  gateOutDate: ["out gated", "outgated", "gate out", "out gate"],
  emptyReturnDate: ["in gated", "ingated", "gate in", "in gate"],
  markedStatus: ["marked shipped / received", "marked shipped/received", "marked status"],
  deliveredThrough: ["delivered through", "delivery through"],
  vesselOrWarehouse: [
    "vessel name / warehouse delivery date",
    "vessel name/warehouse delivery date",
    "vessel name",
  ],
  rejectionReason: ["rejected / deleted reason", "rejected/deleted reason", "reason"],
  redirectionType: ["redirection / rejection", "redirection/rejection"],
  responsibleStakeholder: ["responsible stakeholder", "stakeholder"],
};

/**
 * Sheet values → the documented lifecycle (doc 12 §Status Values).
 * The sheet carries only four distinct values against the documented six.
 */
const STATUS_MAP: Record<string, ContainerStatus> = {
  "on vessel": "Pending",
  "at port": "Pending",
  "container pulled": "Picked Up",
  "picked up": "Picked Up",
  delivered: "Delivered",
  "empty returned": "Empty Returned",
  closed: "Closed",
  "pickup scheduled": "Pickup Scheduled",
};

function mapStatus(raw: string | null, appointmentStatus: string | null): ContainerStatus {
  const key = (raw ?? "").trim().toLowerCase();
  if (STATUS_MAP[key]) return STATUS_MAP[key];

  // Fall back to the appointment lifecycle when container status is blank.
  const appt = (appointmentStatus ?? "").trim().toLowerCase();
  if (appt === "delivered") return "Delivered";
  if (appt === "scheduled" || appt === "rescheduled") return "Pickup Scheduled";
  return "Pending";
}

/**
 * "06/10/2026 19:00 EDT" → "2026-06-10".
 * The sheet stores appointments as a local datetime with a timezone label;
 * only the calendar day participates in LFD logic.
 */
function parseAppointment(raw: string | null): string | null {
  const cleaned = normalizeNullable(raw);
  if (!cleaned) return null;
  return normalizeDate(cleaned.split(/\s+/)[0]);
}

/** One column holds either a vessel name or a warehouse delivery date. */
function splitVesselOrWarehouse(raw: string | null): {
  vesselName: string | null;
  warehouseDeliveryDate: string | null;
} {
  const cleaned = normalizeNullable(raw);
  if (!cleaned) return { vesselName: null, warehouseDeliveryDate: null };
  const asDate = normalizeDate(cleaned);
  return asDate
    ? { vesselName: null, warehouseDeliveryDate: asDate }
    : { vesselName: cleaned, warehouseDeliveryDate: null };
}

/* ---------------- Cache ---------------- */

interface CacheEntry {
  containers: Container[];
  loadedAt: number;
  tabsRead: number;
  rowsRead: number;
  skipped: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

export interface LoadStats {
  containers: number;
  tabsRead: number;
  rowsRead: number;
  skipped: number;
  loadedAt: string;
  cached: boolean;
}

const reader: SourceReader = new CsvSourceReader();

/**
 * Load every container.
 *
 * The result is cached in-process for the configured TTL, and concurrent
 * callers share one in-flight load — with TMS Master as the only store, a
 * cache stampede would mean 14 CSV fetches per request.
 */
export async function loadContainers(force = false): Promise<Container[]> {
  const ttlMs = config.cache.ttlMinutes * 60_000;
  if (!force && cache && Date.now() - cache.loadedAt < ttlMs) return cache.containers;
  if (inflight) return (await inflight).containers;

  inflight = readAllTabs()
    .then(async (entry) => {
      // Operational fields come from the sheets; operator edits live in Neon.
      // Applying overrides at read time means a re-ingest can never clobber
      // an edit, and an edit never has to be written back to a read-only sheet.
      await applyOverrides(entry.containers);
      return entry;
    })
    .finally(() => {
      inflight = null;
    });

  cache = await inflight;
  return cache.containers;
}

/** Merge user-owned fields from Neon over the sheet-derived records. */
async function applyOverrides(containers: Container[]): Promise<void> {
  if (!config.database.configured) return;

  try {
    const { rows } = await query<{
      container_number: string;
      pickup_number: string | null;
      status_override: string | null;
      internal_notes: string | null;
      dispatch_notes: string | null;
      vendor_notes: string | null;
      assigned_dispatcher: string | null;
      priority: string | null;
      tags: string[] | null;
      flags: string[] | null;
      updated_at: string | null;
      updated_by: string | null;
    }>(
      `SELECT container_number, pickup_number, status_override, internal_notes,
              dispatch_notes, vendor_notes, assigned_dispatcher, priority,
              tags, flags, updated_at, updated_by
         FROM containers
        WHERE pickup_number IS NOT NULL
           OR status_override IS NOT NULL
           OR internal_notes IS NOT NULL
           OR dispatch_notes IS NOT NULL
           OR vendor_notes IS NOT NULL
           OR assigned_dispatcher IS NOT NULL
           OR priority IS NOT NULL
           OR array_length(tags, 1) IS NOT NULL
           OR array_length(flags, 1) IS NOT NULL`,
    );

    if (rows.length === 0) return;

    const overrides = new Map(rows.map((row) => [row.container_number, row]));

    for (const container of containers) {
      const override = overrides.get(container.containerNumber);
      if (!override) continue;

      if (override.pickup_number) container.pickupNumber = override.pickup_number;
      if (override.status_override) {
        container.status = override.status_override as Container["status"];
        container.flags = [...container.flags, "status-edited"];
      }
      if (override.internal_notes) container.internalNotes = override.internal_notes;
      if (override.dispatch_notes) container.dispatchNotes = override.dispatch_notes;
      if (override.vendor_notes) container.vendorNotes = override.vendor_notes;
      if (override.assigned_dispatcher)
        container.assignedDispatcher = override.assigned_dispatcher;
      if (override.priority)
        container.priority = override.priority as Container["priority"];
      if (override.tags?.length) container.tags = override.tags;
      if (override.flags?.length)
        container.flags = [...new Set([...container.flags, ...override.flags])];
      if (override.updated_at) container.updatedDate = override.updated_at;
      if (override.updated_by) container.updatedBy = override.updated_by;
    }

    syncLogger.debug({ overrides: rows.length }, "applied operator overrides");
  } catch (error) {
    // A database hiccup must not blank the container list — the sheet data is
    // still valid and useful on its own.
    syncLogger.warn({ err: error }, "could not apply overrides; serving sheet data only");
  }
}

/** Drop the cache so the next read reflects a just-saved edit. */
export function invalidateCache(): void {
  cache = null;
}

export function getLoadStats(): LoadStats | null {
  if (!cache) return null;
  return {
    containers: cache.containers.length,
    tabsRead: cache.tabsRead,
    rowsRead: cache.rowsRead,
    skipped: cache.skipped,
    loadedAt: new Date(cache.loadedAt).toISOString(),
    cached: true,
  };
}

async function readAllTabs(): Promise<CacheEntry> {
  const started = Date.now();
  const spreadsheetId = requireSourceSheetId(1);
  const tabs = await reader.listTabs(spreadsheetId);

  syncLogger.info({ tabs: tabs.length }, "reading Source Sheet 1 tabs");

  // Later rows win on duplicate container numbers, so a container that
  // reappears in a newer monthly tab keeps its most recent state.
  const byContainer = new Map<string, Container>();
  let rowsRead = 0;
  let skipped = 0;

  const results = await Promise.allSettled(
    tabs.map(async (tab) => ({
      tab,
      rows: await reader.readTab(spreadsheetId, tab.gid),
    })),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      syncLogger.warn({ err: result.reason }, "tab read failed, continuing");
      continue;
    }

    const { tab, rows } = result.value;
    if (rows.length < 2) continue;

    const index = buildHeaderIndex(rows[0], SHEET1_ALIASES);
    if (!index.has("containerNumber")) {
      syncLogger.warn({ tab: tab.title }, "no container column, skipping tab");
      continue;
    }

    for (const row of rows.slice(1)) {
      rowsRead++;
      const container = mapRow(row, index, tab.title);
      if (!container) {
        skipped++;
        continue;
      }
      byContainer.set(container.containerNumber, container);
    }
  }

  const containers = [...byContainer.values()];
  syncLogger.info(
    { containers: containers.length, rowsRead, skipped, ms: Date.now() - started },
    "source load complete",
  );

  return { containers, loadedAt: Date.now(), tabsRead: tabs.length, rowsRead, skipped };
}

function mapRow(
  row: string[],
  index: Map<string, number>,
  tabTitle: string,
): Container | null {
  const containerNumber = normalizeContainerNumber(cell(row, index, "containerNumber"));
  if (!containerNumber) return null;

  const appointmentStatus = normalizeName(cell(row, index, "appointmentStatus"));
  const rawStatus = normalizeName(cell(row, index, "status"));
  const { vesselName, warehouseDeliveryDate } = splitVesselOrWarehouse(
    cell(row, index, "vesselOrWarehouse"),
  );

  const now = new Date().toISOString();

  return {
    containerNumber,
    // Source Sheet 1 carries no booking number and no PU — PU can only ever
    // arrive from Outlook screenshots via OCR (confirmed by profiling).
    bookingNumber: null,
    pickupNumber: null,
    blNumber: normalizeName(cell(row, index, "blNumber")),
    ssl: normalizeName(cell(row, index, "ssl")),
    terminal: normalizeName(cell(row, index, "terminal")),
    appointmentDate: parseAppointment(cell(row, index, "appointmentDate")),
    lastFreeDay: normalizeDate(cell(row, index, "lastFreeDay")),
    gateInDate: null,
    gateOutDate: normalizeDate(cell(row, index, "gateOutDate")),
    // "In gated" follows "Out gated" chronologically in the data, so it reads
    // as the empty return rather than the original terminal entry.
    emptyReturnDate: normalizeDate(cell(row, index, "emptyReturnDate")),
    isa: normalizeName(cell(row, index, "isa")),
    fc: normalizeName(cell(row, index, "fc")),
    status: mapStatus(rawStatus, appointmentStatus),
    size: null,
    type: null,
    chassisNumber: null,
    driver: null,

    pod: normalizeName(cell(row, index, "pod")),
    eta: normalizeDate(cell(row, index, "eta")),
    appointmentStatus,
    markedStatus: normalizeName(cell(row, index, "markedStatus")),
    deliveredThrough: normalizeName(cell(row, index, "deliveredThrough")),
    vesselName,
    warehouseDeliveryDate,
    rejectionReason: normalizeName(cell(row, index, "rejectionReason")),
    redirectionType: normalizeName(cell(row, index, "redirectionType")),
    responsibleStakeholder: normalizeName(cell(row, index, "responsibleStakeholder")),
    sourceTab: tabTitle,

    trucker: normalizeName(cell(row, index, "trucker")),
    responsibleParty: null,
    forwarder: null,

    internalNotes: null,
    dispatchNotes: null,
    vendorNotes: null,
    aiNotes: null,
    reminderStatus: null,
    assignedDispatcher: null,
    priority: null,
    tags: [],
    flags: isValidContainerNumber(containerNumber) ? [] : ["invalid-container-format"],

    lastEmailDate: null,
    lastEmailSubject: null,
    lastEmailSender: null,
    conversationId: null,
    emailSummary: null,
    emailCount: 0,
    vendorReplied: false,
    reminderSent: false,
    reminderDate: null,

    puScreenshotId: null,
    invoicePdfId: null,
    podFileId: null,
    gateReceiptId: null,
    additionalDocuments: [],

    ocrStatus: "None",
    ocrConfidence: null,
    ocrResult: null,
    ocrApproved: false,
    ocrReviewedBy: null,
    ocrReviewDate: null,

    estimatedCost: null,
    estimatedConfidence: null,
    actualCost: null,
    costVariance: null,
    chassisDays: null,
    demurrageDays: null,
    detentionDays: null,
    storageDays: null,
    lastCostUpdate: null,

    healthScore: null,
    riskScore: null,
    aiRecommendation: null,
    aiConfidence: null,
    aiLastUpdated: null,

    sourceSheet: "Floor-Loaded (USA)",
    importDate: now,
    lastSync: now,
    syncStatus: "Success",
    conflictStatus: "None",

    createdBy: "System",
    createdDate: now,
    updatedBy: "System",
    updatedDate: now,
    version: 1,
  };
}

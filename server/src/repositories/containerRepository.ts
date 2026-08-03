import { byUrgency, lfdRisk, type Container, type LfdRisk } from "@tms/shared";
import { config } from "../config/index.js";
import { query } from "../db/pool.js";
import { pgDate } from "../db/dates.js";
import { getLoadStats, loadContainers } from "../services/containerService.js";
import {
  ACTIVE_STATUSES,
  EMPTY_RISK,
  RISK_SQL,
  riskSqlAt,
  computeAggregates,
  isoDay,
  type DashboardAggregates,
  type GroupCount,
} from "./aggregates.js";

/**
 * Container repository.
 *
 * The seam between "where container data comes from" and everything that
 * consumes it. Today it reads the source sheets via CSV and merges operator
 * overrides from Neon. Once the ingest pipeline has populated Neon, switching
 * to `NeonContainerRepository` is a one-line change in `getContainerRepository`
 * — no consumer is aware of the difference.
 */

export interface RepositoryStats {
  containers: number;
  loadedAt: string;
  source: "sheets" | "neon";
  tabsRead?: number;
  rowsRead?: number;
}

export interface ContainerQuery {
  q?: string;
  trucker?: string;
  ssl?: string;
  terminal?: string;
  pod?: string;
  status?: string;
  risk?: LfdRisk;
  sort: "urgency" | "lfd" | "container" | "eta" | "updated";
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface ContainerQueryResult {
  rows: Container[];
  total: number;
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

export interface ContainerRepository {
  readonly kind: "sheets" | "neon";
  getAll(force?: boolean): Promise<Container[]>;
  getByNumber(containerNumber: string): Promise<Container | null>;
  stats(): Promise<RepositoryStats | null>;
  /**
   * Dashboard counts.
   *
   * Separate from `getAll()` so the Neon path can answer with `GROUP BY`
   * instead of shipping 4,400 rows into Node and counting them there.
   */
  aggregates(now?: Date): Promise<DashboardAggregates>;
  /**
   * One page of containers.
   *
   * Also separate from `getAll()`, and for a sharper reason: filtering in Node
   * meant every list request pulled the entire fleet across the wire. On its
   * own that measured ~2.4s; with three such requests in flight from a single
   * page load it saturated the connection pool and the same query took over
   * two minutes. Paginating in SQL returns tens of rows instead of thousands.
   */
  search(params: ContainerQuery, now?: Date): Promise<ContainerQueryResult>;
  /** Distinct facet values with counts, for the filter controls. */
  filterOptions(): Promise<FilterOptions>;
}

/** Fields a free-text query is matched against, in both implementations. */
const SEARCH_FIELDS = [
  "container_number",
  "bl_number",
  "pickup_number",
  "isa",
  "fc",
  "trucker",
  "terminal",
  "ssl",
  "pod",
] as const;

/** Reads the source sheets; operator overrides merged in by containerService. */
class SheetContainerRepository implements ContainerRepository {
  readonly kind = "sheets" as const;

  getAll(force = false): Promise<Container[]> {
    return loadContainers(force);
  }

  async getByNumber(containerNumber: string): Promise<Container | null> {
    const all = await this.getAll();
    return all.find((c) => c.containerNumber === containerNumber) ?? null;
  }

  async stats(): Promise<RepositoryStats | null> {
    const loaded = getLoadStats();
    if (!loaded) return null;
    return {
      containers: loaded.containers,
      loadedAt: loaded.loadedAt,
      source: "sheets",
      tabsRead: loaded.tabsRead,
      rowsRead: loaded.rowsRead,
    };
  }

  async aggregates(now = new Date()): Promise<DashboardAggregates> {
    // The sheet path already holds every row in memory, so counting in Node
    // costs nothing extra here.
    return computeAggregates(await this.getAll(), now);
  }

  async search(params: ContainerQuery, now = new Date()): Promise<ContainerQueryResult> {
    return searchInMemory(await this.getAll(), params, now);
  }

  async filterOptions(): Promise<FilterOptions> {
    const all = await this.getAll();
    const distinct = (pick: (c: Container) => string | null): FilterOption[] => {
      const counts = new Map<string, number>();
      for (const c of all) {
        const value = pick(c);
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    };

    return {
      truckers: distinct((c) => c.trucker),
      ssls: distinct((c) => c.ssl),
      terminals: distinct((c) => c.terminal),
      pods: distinct((c) => c.pod),
      statuses: distinct((c) => c.status),
      total: all.length,
    };
  }
}

/**
 * Filter, sort and page a container list in Node.
 *
 * Exported so `scripts/check-search-parity.ts` can run it over rows read from
 * Neon and compare the result with what `NeonContainerRepository.search()`
 * returns for the same query — the two are one rule expressed twice, and this
 * is what stops them drifting.
 */
export function searchInMemory(
  all: Container[],
  params: ContainerQuery,
  now = new Date(),
): ContainerQueryResult {
  const needle = params.q ? params.q.replace(/\s+/g, "").toLowerCase() : null;

  const filtered = all.filter((c) => {
    if (needle && !matchesQuery(c, needle)) return false;
    if (params.trucker && c.trucker !== params.trucker) return false;
    if (params.ssl && c.ssl !== params.ssl) return false;
    if (params.terminal && c.terminal !== params.terminal) return false;
    if (params.pod && c.pod !== params.pod) return false;
    if (params.status && c.status !== params.status) return false;
    if (params.risk && lfdRisk(c, now) !== params.risk) return false;
    return true;
  });

  const sorted = sortContainers(filtered, params.sort, params.direction, now);
  const start = (params.page - 1) * params.pageSize;
  return { rows: sorted.slice(start, start + params.pageSize), total: sorted.length };
}

/**
 * Forgiving match — an operator reading a number off an email types
 * "mscu 745" or "7452210", and both must hit. Whitespace is stripped from the
 * needle only, matching the SQL path's `concat_ws` + ILIKE.
 */
function matchesQuery(container: Container, needle: string): boolean {
  return [
    container.containerNumber,
    container.blNumber,
    container.pickupNumber,
    container.isa,
    container.fc,
    container.trucker,
    container.terminal,
    container.ssl,
    container.pod,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .includes(needle);
}

function sortContainers(
  list: Container[],
  sort: ContainerQuery["sort"],
  direction: "asc" | "desc",
  now: Date,
): Container[] {
  const flip = direction === "desc" ? -1 : 1;

  const primary = (a: Container, b: Container): number => {
    switch (sort) {
      case "lfd":
        return nullsLast(a.lastFreeDay, b.lastFreeDay, flip);
      case "container":
        return flip * a.containerNumber.localeCompare(b.containerNumber);
      case "eta":
        return nullsLast(a.eta, b.eta, flip);
      case "updated":
        return nullsLast(a.updatedDate, b.updatedDate, flip);
      default:
        // Urgency is the operational default: most at-risk container first.
        return flip * byUrgency(a, b, now);
    }
  };

  // Ties break on container number, ascending, in both directions — matching
  // the SQL path's trailing `ORDER BY ..., container_number`.
  //
  // Without it the order within a tie is whatever the input happened to be,
  // so the same query could return the same containers in a different
  // sequence between the two paths — and paging through a large tie group
  // could show a container twice while skipping another entirely.
  return [...list].sort(
    (a, b) => primary(a, b) || a.containerNumber.localeCompare(b.containerNumber),
  );
}

/**
 * Nulls sort last in BOTH directions — a missing LFD is not "earliest", and
 * flipping the sort must not promote it to the top of the worklist.
 *
 * `flip` is applied only to the value comparison, never to the null verdict.
 * Applying it to the whole result (as this once did) inverted nulls-last into
 * nulls-first on a descending sort, which is what `NULLS LAST` in the SQL
 * path deliberately does not do.
 */
function nullsLast(a: string | null, b: string | null, flip: number): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a === b) return 0;
  return flip * (a < b ? -1 : 1);
}

/**
 * Reads containers from Neon.
 *
 * Only usable once the ingest pipeline has run — an empty table would render
 * an empty dashboard, which is why `getContainerRepository` checks for rows
 * before selecting this implementation rather than assuming.
 */
class NeonContainerRepository implements ContainerRepository {
  readonly kind = "neon" as const;

  async getAll(): Promise<Container[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT * FROM containers ORDER BY last_free_day NULLS LAST`,
    );
    return rows.map(rowToContainer);
  }

  async getByNumber(containerNumber: string): Promise<Container | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT * FROM containers WHERE container_number = $1`,
      [containerNumber],
    );
    return rows[0] ? rowToContainer(rows[0]) : null;
  }

  async stats(): Promise<RepositoryStats | null> {
    const { rows } = await query<{ count: string; latest: Date | null }>(
      `SELECT COUNT(*)::text AS count, MAX(last_synced_at) AS latest FROM containers`,
    );
    return {
      containers: Number(rows[0]?.count ?? 0),
      loadedAt: rows[0]?.latest?.toISOString() ?? new Date().toISOString(),
      source: "neon",
    };
  }

  /**
   * Aggregate in the database.
   *
   * Replaces pulling 4,400 rows into Node per request. All five queries run
   * concurrently — they are independent, and the round trip to Neon dominates
   * the cost, so issuing them in parallel is most of the win.
   */
  async aggregates(now = new Date()): Promise<DashboardAggregates> {
    const today = isoDay(now);
    const active = ACTIVE_STATUSES;
    const staleCutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString();

    const groupQuery = (column: string) => `
      SELECT ${column} AS name,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ${RISK_SQL} IN ('overdue','critical'))::int AS at_risk,
             COUNT(*) FILTER (WHERE COALESCE(status_override, src_status) = ANY($2))::int AS active
        FROM containers
       WHERE ${column} IS NOT NULL AND ${column} <> ''
       GROUP BY ${column}
       ORDER BY total DESC, name ASC`;

    const [riskRows, statusRows, headlineRows, terminals, pods, truckers, upcoming] =
      await Promise.all([
        query<{ risk: string; count: number }>(
          `SELECT ${RISK_SQL} AS risk, COUNT(*)::int AS count
             FROM containers GROUP BY 1`,
          [today],
        ),
        query<{ status: string; count: number }>(
          `SELECT COALESCE(status_override, src_status, 'Pending') AS status,
                  COUNT(*)::int AS count
             FROM containers GROUP BY 1`,
        ),
        query<Record<string, number>>(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE COALESCE(status_override, src_status) = ANY($2))::int AS active_containers,
             COUNT(*) FILTER (WHERE COALESCE(status_override, src_status) = 'Pending')::int AS at_port,
             COUNT(*) FILTER (WHERE COALESCE(status_override, src_status) = ANY($2)
                                AND COALESCE(status_override, src_status) <> 'Pending')::int AS in_transit,
             COUNT(*) FILTER (WHERE NOT (COALESCE(status_override, src_status) = ANY($2)))::int AS completed,
             COUNT(*) FILTER (WHERE eta = $1::date)::int AS arriving_today,
             COUNT(*) FILTER (WHERE appointment_date = $1::date)::int AS appointments_today,
             COUNT(*) FILTER (WHERE last_free_day = $1::date)::int AS lfd_due_today,
             COUNT(*) FILTER (WHERE COALESCE(status_override, src_status) = ANY($2)
                                AND pickup_number IS NULL)::int AS missing_pu,
             COUNT(*) FILTER (WHERE COALESCE(status_override, src_status) = ANY($2)
                                AND appointment_date IS NULL)::int AS missing_appointment,
             COUNT(*) FILTER (WHERE COALESCE(status_override, src_status) = ANY($2)
                                AND (trucker IS NULL OR trucker = ''))::int AS unassigned,
             COUNT(*) FILTER (WHERE COALESCE(status_override, src_status) = ANY($2)
                                AND updated_at < $3::timestamptz)::int AS stale
           FROM containers`,
          [today, active, staleCutoff],
        ),
        query<GroupCount & { at_risk: number }>(groupQuery("terminal"), [today, active]),
        query<GroupCount & { at_risk: number }>(groupQuery("pod"), [today, active]),
        query<GroupCount & { at_risk: number }>(groupQuery("trucker"), [today, active]),
        query<{ date: string; count: number }>(
          `SELECT to_char(appointment_date, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
             FROM containers
            WHERE appointment_date BETWEEN $1::date AND ($1::date + 6)
            GROUP BY 1`,
          [today],
        ),
      ]);

    const risk = { ...EMPTY_RISK };
    for (const row of riskRows.rows) {
      risk[row.risk as keyof typeof risk] = row.count;
    }

    const status: Record<string, number> = {};
    for (const row of statusRows.rows) status[row.status] = row.count;

    const headline = headlineRows.rows[0] ?? {};
    const toGroups = (rows: (GroupCount & { at_risk: number })[]): GroupCount[] =>
      rows.map((r) => ({
        name: r.name,
        total: r.total,
        atRisk: r.at_risk,
        active: r.active,
      }));

    // Fill every one of the next seven days, including those with no
    // appointments — a gap in the chart must read as zero, not as missing.
    const byDate = new Map(upcoming.rows.map((r) => [r.date, r.count]));
    const week = Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(now);
      day.setDate(day.getDate() + offset);
      const key = isoDay(day);
      return { date: key, count: byDate.get(key) ?? 0 };
    });

    return {
      total: headline.total ?? 0,
      risk,
      status,
      activeContainers: headline.active_containers ?? 0,
      atPort: headline.at_port ?? 0,
      inTransit: headline.in_transit ?? 0,
      completed: headline.completed ?? 0,
      arrivingToday: headline.arriving_today ?? 0,
      appointmentsToday: headline.appointments_today ?? 0,
      lfdDueToday: headline.lfd_due_today ?? 0,
      missingPu: headline.missing_pu ?? 0,
      missingAppointment: headline.missing_appointment ?? 0,
      unassigned: headline.unassigned ?? 0,
      stale: headline.stale ?? 0,
      byTerminal: toGroups(terminals.rows),
      byPod: toGroups(pods.rows),
      byTrucker: toGroups(truckers.rows),
      upcoming: week,
    };
  }

  /**
   * One page, filtered and sorted in the database.
   *
   * `$1` is always the reference date — `RISK_SQL` and the urgency ordering
   * both need it. Everything else is appended positionally as the filters
   * that were actually supplied, so the statement never binds a parameter it
   * does not reference.
   */
  async search(params: ContainerQuery, now = new Date()): Promise<ContainerQueryResult> {
    const values: unknown[] = [];
    const where: string[] = [];

    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    // Bound lazily and only once: a plain `sort=container` query references no
    // date at all, and binding one it never uses is rejected by Postgres.
    let todayParam: string | null = null;
    const today = (): string => (todayParam ??= bind(isoDay(now)));

    if (params.q) {
      // Substring match, not full-text: an operator types a fragment of a
      // container number, and to_tsvector only matches whole tokens. The GIN
      // index does not serve this, but a sequential scan over 4,400 rows
      // inside Postgres is still far cheaper than shipping them all to Node.
      const needle = params.q.replace(/\s+/g, "");
      where.push(
        `concat_ws('|', ${SEARCH_FIELDS.join(", ")}) ILIKE ${bind(`%${needle}%`)}`,
      );
    }
    if (params.trucker) where.push(`trucker = ${bind(params.trucker)}`);
    if (params.ssl) where.push(`ssl = ${bind(params.ssl)}`);
    if (params.terminal) where.push(`terminal = ${bind(params.terminal)}`);
    if (params.pod) where.push(`pod = ${bind(params.pod)}`);
    if (params.status) {
      where.push(`COALESCE(status_override, src_status) = ${bind(params.status)}`);
    }
    if (params.risk) where.push(`(${riskSqlAt(today())}) = ${bind(params.risk)}`);

    const flip = params.direction === "desc" ? "DESC" : "ASC";
    const order =
      params.sort === "lfd"
        ? `last_free_day ${flip} NULLS LAST`
        : params.sort === "container"
          ? `container_number ${flip}`
          : params.sort === "eta"
            ? `eta ${flip} NULLS LAST`
            : params.sort === "updated"
              ? `updated_at ${flip} NULLS LAST`
              : `${urgencySql(today())} ${flip}, last_free_day ${flip} NULLS LAST`;

    const { rows } = await query<Record<string, unknown>>(
      `SELECT *, COUNT(*) OVER()::int AS __total
         FROM containers
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY ${order}, container_number
        LIMIT ${bind(params.pageSize)} OFFSET ${bind((params.page - 1) * params.pageSize)}`,
      values,
    );

    return {
      rows: rows.map(rowToContainer),
      // COUNT(*) OVER() gives the pre-LIMIT total in the same round trip; with
      // no matching rows there is no window to read it from, hence the zero.
      total: (rows[0]?.__total as number | undefined) ?? 0,
    };
  }

  async filterOptions(): Promise<FilterOptions> {
    const facet = (column: string, alias = column) => `
      SELECT ${alias} AS value, COUNT(*)::int AS count
        FROM containers
       WHERE ${alias} IS NOT NULL AND ${alias} <> ''
       GROUP BY ${alias}
       ORDER BY count DESC`;

    const [truckers, ssls, terminals, pods, statuses, total] = await Promise.all([
      query<FilterOption>(facet("trucker")),
      query<FilterOption>(facet("ssl")),
      query<FilterOption>(facet("terminal")),
      query<FilterOption>(facet("pod")),
      query<FilterOption>(`
        SELECT COALESCE(status_override, src_status, 'Pending') AS value,
               COUNT(*)::int AS count
          FROM containers GROUP BY 1 ORDER BY count DESC`),
      query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM containers`),
    ]);

    return {
      truckers: truckers.rows,
      ssls: ssls.rows,
      terminals: terminals.rows,
      pods: pods.rows,
      statuses: statuses.rows,
      total: total.rows[0]?.count ?? 0,
    };
  }
}

/**
 * SQL mirror of `byUrgency()` — risk band first, then days to LFD ascending.
 *
 * Nulls last in both directions, matching the comparator's use of
 * MAX_SAFE_INTEGER for a container with no last free day.
 */
const urgencySql = (dateParam: string): string => `
  CASE ${riskSqlAt(dateParam)}
    WHEN 'overdue'  THEN 0
    WHEN 'critical' THEN 1
    WHEN 'warning'  THEN 2
    WHEN 'safe'     THEN 3
    ELSE 4
  END`;

/** Map a Neon row onto the shared domain shape. */
function rowToContainer(row: Record<string, unknown>): Container {
  const text = (key: string) => (row[key] as string | null) ?? null;
  // pgDate, not toISOString — see db/dates.ts. A DATE arrives as local
  // midnight, so serialising it as UTC moves it a day earlier.
  const date = (key: string) => pgDate(row[key] as Date | string | null);

  return {
    containerNumber: String(row.container_number),
    bookingNumber: null,
    blNumber: text("bl_number"),
    ssl: text("ssl"),
    terminal: text("terminal"),
    // The operator override wins over the sheet value, matching the merge
    // rule used on the sheet-backed path.
    pickupNumber: text("pickup_number"),
    appointmentDate: date("appointment_date"),
    lastFreeDay: date("last_free_day"),
    gateInDate: null,
    gateOutDate: date("gate_out_date"),
    emptyReturnDate: date("empty_return_date"),
    isa: text("isa"),
    fc: text("fc"),
    status: (text("status_override") ?? text("src_status") ?? "Pending") as Container["status"],
    size: null,
    type: null,
    chassisNumber: null,
    driver: null,

    pod: text("pod"),
    eta: date("eta"),
    appointmentStatus: text("appointment_status"),
    markedStatus: text("marked_status"),
    deliveredThrough: text("delivered_through"),
    vesselName: text("vessel_name"),
    warehouseDeliveryDate: date("warehouse_delivery_date"),
    rejectionReason: text("rejection_reason"),
    redirectionType: text("redirection_type"),
    responsibleStakeholder: text("responsible_stakeholder"),
    sourceTab: text("source_tab"),

    trucker: text("trucker"),
    responsibleParty: null,
    forwarder: null,

    internalNotes: text("internal_notes"),
    dispatchNotes: text("dispatch_notes"),
    vendorNotes: text("vendor_notes"),
    aiNotes: null,
    reminderStatus: null,
    assignedDispatcher: text("assigned_dispatcher"),
    priority: text("priority") as Container["priority"],
    tags: (row.tags as string[] | null) ?? [],
    flags: (row.flags as string[] | null) ?? [],

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

    sourceSheet: text("source_sheet"),
    importDate: null,
    lastSync: (row.last_synced_at as Date | null)?.toISOString() ?? null,
    syncStatus: "Success",
    conflictStatus: "None",

    createdBy: "System",
    createdDate: (row.first_seen_at as Date | null)?.toISOString() ?? "",
    updatedBy: text("updated_by") ?? "System",
    updatedDate: (row.updated_at as Date | null)?.toISOString() ?? "",
    version: Number(row.version ?? 1),
  };
}

const sheetRepository = new SheetContainerRepository();
const neonRepository = new NeonContainerRepository();

/** Cached so the readiness probe runs once, not per request. */
let neonReady: boolean | null = null;

/**
 * Choose the backing store.
 *
 * Neon is preferred once it actually holds containers. Until the ingest has
 * run the table is empty, and silently serving an empty dashboard from it
 * would look like a bug rather than a missing step — so the sheet path stays
 * in use until there is data to switch to.
 *
 * Set `CONTAINER_SOURCE=sheets` to pin the sheet path explicitly.
 */
export async function getContainerRepository(): Promise<ContainerRepository> {
  if (process.env.CONTAINER_SOURCE === "sheets") return sheetRepository;
  if (process.env.CONTAINER_SOURCE === "neon") return neonRepository;
  if (!config.database.configured) return sheetRepository;

  if (neonReady === null) {
    try {
      // Readiness is "an ingest has completed", NOT "the table has rows".
      //
      // The edit endpoint inserts a container row to hold operator overrides,
      // so a single edit on a fresh database would otherwise make the table
      // look populated — and the dashboard would serve 1 container instead of
      // 4,400. A recorded successful sync run is the only honest signal.
      const { rows } = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM sync_runs
          WHERE status = 'Success' AND containers_upserted > 0`,
      );
      neonReady = Number(rows[0]?.count ?? 0) > 0;
    } catch {
      neonReady = false;
    }
  }

  return neonReady ? neonRepository : sheetRepository;
}

/** Call after an ingest so the next request re-evaluates the source. */
export function resetRepositorySelection(): void {
  neonReady = null;
}

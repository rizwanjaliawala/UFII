import { LFD_THRESHOLDS, lfdRisk, type Container, type LfdRisk } from "@tms/shared";

/**
 * Dashboard aggregates.
 *
 * Two implementations produce these: one counting rows in Node (sheet path),
 * one using SQL `GROUP BY` (Neon path). Both must agree exactly, so the SQL
 * mirrors `lfdRisk()` from @tms/shared rather than inventing its own rules.
 *
 * That duplication is the real hazard here — if the thresholds in
 * `LFD_THRESHOLDS` ever change, `RISK_SQL` below must change with them.
 * `aggregates.test.ts` compares both paths over the same fixture to catch a
 * drift rather than trusting the comment.
 */

export interface GroupCount {
  name: string;
  total: number;
  atRisk: number;
  active: number;
}

export interface DashboardAggregates {
  total: number;
  risk: Record<LfdRisk, number>;
  status: Record<string, number>;
  activeContainers: number;
  atPort: number;
  inTransit: number;
  completed: number;
  arrivingToday: number;
  appointmentsToday: number;
  lfdDueToday: number;
  missingPu: number;
  missingAppointment: number;
  unassigned: number;
  stale: number;
  byTerminal: GroupCount[];
  byPod: GroupCount[];
  byTrucker: GroupCount[];
  upcoming: { date: string; count: number }[];
}

/** Statuses that mean the container is still in play. */
export const ACTIVE_STATUSES = ["Pending", "Pickup Scheduled", "Picked Up"];

/**
 * SQL mirror of `lfdRisk()`.
 *
 * Kept as one exported fragment so every query classifies risk identically —
 * a second hand-written CASE elsewhere is how the two paths would silently
 * diverge.
 *
 * `$1` is the reference date (today), passed explicitly rather than using
 * NOW() so the server's timezone cannot shift a boundary: LFD is a calendar
 * day, and "is it overdue" must not depend on where the process runs.
 */
export const RISK_SQL = `
  CASE
    WHEN gate_out_date IS NOT NULL
      OR COALESCE(status_override, src_status) IN ('Picked Up','Delivered','Empty Returned','Closed')
      THEN 'cleared'
    WHEN last_free_day IS NULL THEN 'safe'
    WHEN (last_free_day - $1::date) < ${LFD_THRESHOLDS.critical} THEN 'overdue'
    WHEN (last_free_day - $1::date) <= ${LFD_THRESHOLDS.critical} THEN 'critical'
    WHEN (last_free_day - $1::date) <= ${LFD_THRESHOLDS.warning} THEN 'warning'
    ELSE 'safe'
  END`;

/**
 * `RISK_SQL` bound to a different placeholder.
 *
 * A statement must not bind a parameter it never references — Postgres
 * rejects the bind outright ("could not determine data type of parameter").
 * A query that assembles its filters dynamically therefore cannot assume the
 * reference date is `$1`, so it asks for the fragment at the position it
 * actually used.
 */
export const riskSqlAt = (placeholder: string): string =>
  RISK_SQL.split("$1").join(placeholder);

export const EMPTY_RISK: Record<LfdRisk, number> = {
  overdue: 0,
  critical: 0,
  warning: 0,
  safe: 0,
  cleared: 0,
};

export const isoDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

/**
 * Compute aggregates in Node.
 *
 * Used by the sheet path, and by the test that proves the SQL path matches.
 */
export function computeAggregates(
  containers: Container[],
  now: Date,
  staleDays = 3,
): DashboardAggregates {
  const today = isoDay(now);
  const risk = { ...EMPTY_RISK };
  const status: Record<string, number> = {};
  const active = new Set(ACTIVE_STATUSES);

  let activeContainers = 0;
  let atPort = 0;
  let inTransit = 0;
  let completed = 0;
  let arrivingToday = 0;
  let appointmentsToday = 0;
  let lfdDueToday = 0;
  let missingPu = 0;
  let missingAppointment = 0;
  let unassigned = 0;
  let stale = 0;

  const terminals = new Map<string, GroupCount>();
  const pods = new Map<string, GroupCount>();
  const truckers = new Map<string, GroupCount>();

  const bump = (
    map: Map<string, GroupCount>,
    key: string | null,
    atRisk: boolean,
    isActive: boolean,
  ) => {
    if (!key) return;
    const entry = map.get(key) ?? { name: key, total: 0, atRisk: 0, active: 0 };
    entry.total++;
    if (atRisk) entry.atRisk++;
    if (isActive) entry.active++;
    map.set(key, entry);
  };

  const staleMs = staleDays * 86_400_000;

  for (const container of containers) {
    const containerRisk = lfdRisk(container, now);
    risk[containerRisk]++;
    status[container.status] = (status[container.status] ?? 0) + 1;

    const isActive = active.has(container.status);
    const atRisk = containerRisk === "overdue" || containerRisk === "critical";

    if (isActive) {
      activeContainers++;
      if (container.status === "Pending") atPort++;
      else inTransit++;

      if (!container.pickupNumber) missingPu++;
      if (!container.appointmentDate) missingAppointment++;
      if (!container.trucker) unassigned++;
      if (
        container.updatedDate &&
        now.getTime() - new Date(container.updatedDate).getTime() > staleMs
      ) {
        stale++;
      }
    } else {
      completed++;
    }

    if (container.eta === today) arrivingToday++;
    if (container.appointmentDate === today) appointmentsToday++;
    if (container.lastFreeDay === today) lfdDueToday++;

    bump(terminals, container.terminal, atRisk, isActive);
    bump(pods, container.pod, atRisk, isActive);
    bump(truckers, container.trucker, atRisk, isActive);
  }

  const upcoming = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const key = isoDay(day);
    return {
      date: key,
      count: containers.filter((c) => c.appointmentDate === key).length,
    };
  });

  const sorted = (map: Map<string, GroupCount>) =>
    [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    total: containers.length,
    risk,
    status,
    activeContainers,
    atPort,
    inTransit,
    completed,
    arrivingToday,
    appointmentsToday,
    lfdDueToday,
    missingPu,
    missingAppointment,
    unassigned,
    stale,
    byTerminal: sorted(terminals),
    byPod: sorted(pods),
    byTrucker: sorted(truckers),
    upcoming,
  };
}

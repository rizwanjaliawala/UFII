import { lfdRisk, type Container } from "@tms/shared";
import { config } from "../config/index.js";
import { query } from "../db/pool.js";
import { pgDate } from "../db/dates.js";
import { getContainerRepository } from "../repositories/containerRepository.js";
import { ACTIVE_STATUSES, isoDay } from "../repositories/aggregates.js";

/**
 * Alerts & Reminders (doc 03 §Alerts).
 *
 * An alert rule is one condition that means "somebody has to act". Each rule
 * carries both a SQL predicate and an equivalent Node predicate, because the
 * application still runs on either store — the SQL keeps the Neon path from
 * pulling 4,400 rows to find 7 problems, and the Node predicate keeps the
 * sheet path working before an ingest has ever run.
 *
 * The pair is the risk: two expressions of one rule can drift. They are held
 * side by side in a single object literal rather than in separate files so a
 * change to one is visibly a change to the other, and `alertService.test.ts`
 * runs both over the same fixtures.
 *
 * Sending is NOT here. Reminder delivery goes through Outlook Desktop COM in
 * Phase 3; until then this module detects and lists, and the reminder log
 * reports itself unavailable rather than showing an empty table that would
 * read as "no reminders needed".
 */

export type AlertSeverity = "critical" | "warning" | "info";

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
  severity: AlertSeverity;
  action: string;
  count: number;
  rows: AlertRow[];
}

export interface AlertSummary {
  generatedAt: string;
  source: "sheets" | "neon";
  groups: AlertGroup[];
  totals: { critical: number; warning: number; info: number; containers: number };
  /** Rules that exist but whose input data does not — never reported as 0. */
  unmeasurable: { label: string; reason: string; phase: string }[];
  /** Rules an operator switched off — stated, so a quiet board is explicable. */
  disabledRules: string[];
  reminders: { available: boolean; reason: string; phase: string };
}

/** Sample size per group. The list is a worklist, not an export. */
const SAMPLE_LIMIT = 25;

/** Rows still in play. Anything gated out or delivered raises nothing. */
const ACTIVE_SQL = `COALESCE(status_override, src_status) = ANY($2)`;

/** Not yet collected — the shared precondition for every LFD rule. */
const OPEN_SQL = `gate_out_date IS NULL
  AND COALESCE(status_override, src_status)
      NOT IN ('Picked Up','Delivered','Empty Returned','Closed')`;

const isOpen = (c: Container): boolean => {
  const risk = lfdRisk(c);
  return risk !== "cleared";
};

const isActive = (c: Container): boolean => ACTIVE_STATUSES.includes(c.status);

const daysTo = (day: string | null, now: Date): number | null => {
  if (!day) return null;
  const target = new Date(`${day}T00:00:00`);
  const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - anchor.getTime()) / 86_400_000);
};

interface RuleContext {
  today: string;
  active: string[];
  now: Date;
}

interface AlertRule {
  id: string;
  label: string;
  description: string;
  severity: AlertSeverity;
  action: string;
  /** WHERE fragment. `$1` is always today; further placeholders are the
   *  rule's own, supplied by `params` below. */
  sql: string;
  /**
   * Bind values, in placeholder order.
   *
   * Declared per rule rather than shared, because Postgres rejects a bind
   * message carrying more parameters than the statement references — passing
   * one common list would fail every rule that happens not to need `$2`.
   */
  params: (ctx: RuleContext) => unknown[];
  match: (container: Container, now: Date) => boolean;
  /**
   * Set when the rule is written but the data it needs does not exist yet.
   *
   * Such a rule is reported as unmeasurable rather than evaluated, because
   * running it would produce a confident `0` — and "no container is stale"
   * reads as reassurance when the truth is "staleness is not being measured"
   * (doc 09 §Reporting).
   */
  unmeasurable?: { reason: string; phase: string };
}

const STALE_DAYS = 3;

export const ALERT_RULES: AlertRule[] = [
  {
    id: "overdue",
    label: "Past Last Free Day",
    description: "Still at the terminal after free time expired",
    severity: "critical",
    action: "Demurrage is accruing daily — dispatch or escalate now",
    sql: `${OPEN_SQL} AND last_free_day IS NOT NULL AND (last_free_day - $1::date) < 0`,
    params: ({ today }) => [today],
    match: (c, now) => isOpen(c) && (daysTo(c.lastFreeDay, now) ?? 99) < 0,
  },
  {
    id: "lfd-today",
    label: "Last Free Day is today",
    description: "Free time ends at close of business",
    severity: "critical",
    action: "Must gate out today to avoid a demurrage charge",
    sql: `${OPEN_SQL} AND last_free_day = $1::date`,
    params: ({ today }) => [today],
    match: (c, now) => isOpen(c) && daysTo(c.lastFreeDay, now) === 0,
  },
  {
    id: "lfd-soon",
    label: "Last Free Day within 2 days",
    description: "Free time expires inside the booking window",
    severity: "warning",
    action: "Book an appointment before slots close",
    sql: `${OPEN_SQL} AND (last_free_day - $1::date) BETWEEN 1 AND 2`,
    params: ({ today }) => [today],
    match: (c, now) => {
      const days = daysTo(c.lastFreeDay, now);
      return isOpen(c) && days !== null && days >= 1 && days <= 2;
    },
  },
  {
    id: "no-appointment",
    label: "No appointment, LFD approaching",
    description: "Free time ends within 5 days and nothing is booked",
    severity: "warning",
    action: "Book a terminal appointment",
    sql: `${ACTIVE_SQL} AND ${OPEN_SQL}
      AND appointment_date IS NULL
      AND last_free_day IS NOT NULL
      AND (last_free_day - $1::date) BETWEEN 0 AND 5`,
    params: ({ today, active }) => [today, active],
    match: (c, now) => {
      const days = daysTo(c.lastFreeDay, now);
      return (
        isActive(c) &&
        isOpen(c) &&
        !c.appointmentDate &&
        days !== null &&
        days >= 0 &&
        days <= 5
      );
    },
  },
  {
    id: "unassigned",
    label: "No trucker assigned",
    description: "Active container with nobody scheduled to haul it",
    severity: "warning",
    action: "Assign a carrier",
    sql: `${ACTIVE_SQL} AND ${OPEN_SQL}
      AND (trucker IS NULL OR trucker = '')
      AND (last_free_day IS NULL OR (last_free_day - $1::date) <= 14)`,
    params: ({ today, active }) => [today, active],
    match: (c, now) => {
      const days = daysTo(c.lastFreeDay, now);
      return isActive(c) && isOpen(c) && !c.trucker && (days === null || days <= 14);
    },
  },
  {
    id: "no-pu",
    label: "Appointment booked, no pickup number",
    description: "The driver cannot collect without a PU",
    severity: "warning",
    action: "Extract the PU from Outlook, or enter it manually",
    sql: `${ACTIVE_SQL} AND ${OPEN_SQL}
      AND appointment_date IS NOT NULL
      AND appointment_date >= $1::date
      AND pickup_number IS NULL`,
    params: ({ today, active }) => [today, active],
    match: (c, now) => {
      const days = daysTo(c.appointmentDate, now);
      return (
        isActive(c) && isOpen(c) && !!c.appointmentDate && days !== null && days >= 0 && !c.pickupNumber
      );
    },
  },
  {
    id: "stale",
    label: `No update in ${STALE_DAYS}+ days`,
    description: "Active container nobody has touched",
    severity: "info",
    action: "Confirm the status with the vendor",
    sql: `${ACTIVE_SQL} AND ${OPEN_SQL} AND updated_at < $3::timestamptz`,
    params: ({ today, active, now }) => [
      today,
      active,
      new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString(),
    ],
    match: (c, now) =>
      isActive(c) &&
      isOpen(c) &&
      !!c.updatedDate &&
      now.getTime() - new Date(c.updatedDate).getTime() > STALE_DAYS * 86_400_000,
    // `containers.updated_at` is stamped by the ingest, so it records when we
    // last synced — not when anybody last acted on the container. With a daily
    // sync it can never exceed three days, so the rule would report 0 forever
    // while appearing to work.
    unmeasurable: {
      reason:
        "containers.updated_at records the last ingest, not the last operator " +
        "or vendor action. Real staleness needs the last email date on the " +
        "container's Outlook thread.",
      phase: "Phase 3",
    },
  },
];

/** Rules whose inputs exist today. The rest are reported, not evaluated. */
const MEASURABLE_RULES = ALERT_RULES.filter((rule) => !rule.unmeasurable);

/**
 * Operator settings for the built-in rules (doc 03 §Alerts, rule config).
 *
 * Only enable/disable is stored. The predicates stay in code because each
 * exists twice — once as SQL, once as Node — and a user-authored predicate
 * would be neither testable nor safe to run against the database.
 *
 * A rule with no row uses its code default, so an empty table means the
 * application behaves exactly as before anyone touched this.
 */
export interface RuleSetting {
  ruleId: string;
  label: string;
  description: string;
  severity: AlertSeverity;
  enabled: boolean;
  measurable: boolean;
  unmeasurableReason?: string;
}

async function disabledRuleIds(): Promise<Set<string>> {
  if (!config.database.configured) return new Set();
  try {
    const { rows } = await query<{ rule_id: string }>(
      `SELECT rule_id FROM alert_rule_settings WHERE enabled = FALSE`,
    );
    return new Set(rows.map((r) => r.rule_id));
  } catch {
    // A missing settings table must not take alerting down — the code
    // defaults are a safe answer.
    return new Set();
  }
}

export async function listRuleSettings(): Promise<RuleSetting[]> {
  const disabled = await disabledRuleIds();
  return ALERT_RULES.map((rule) => ({
    ruleId: rule.id,
    label: rule.label,
    description: rule.description,
    severity: rule.severity,
    enabled: !disabled.has(rule.id),
    measurable: !rule.unmeasurable,
    unmeasurableReason: rule.unmeasurable?.reason,
  }));
}

export async function setRuleEnabled(
  ruleId: string,
  enabled: boolean,
  actor: string,
): Promise<boolean> {
  if (!ALERT_RULES.some((r) => r.id === ruleId)) return false;

  await query(
    `INSERT INTO alert_rule_settings (rule_id, enabled, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (rule_id) DO UPDATE
       SET enabled = $2, updated_by = $3, updated_at = NOW()`,
    [ruleId, enabled, actor],
  );
  return true;
}

export async function getAlerts(now = new Date()): Promise<AlertSummary> {
  const repository = await getContainerRepository();

  const disabled = await disabledRuleIds();

  const evaluated =
    repository.kind === "neon" && config.database.configured
      ? await fromSql(now)
      : fromContainers(await repository.getAll(), now);

  // Filtered after evaluation rather than before, so turning a rule back on
  // needs no re-query path and the two stores stay symmetric.
  const groups = evaluated.filter((g) => !disabled.has(g.id));

  const totals = { critical: 0, warning: 0, info: 0, containers: 0 };
  for (const group of groups) {
    totals[group.severity] += group.count;
    totals.containers += group.count;
  }

  return {
    generatedAt: now.toISOString(),
    source: repository.kind,
    // Empty groups are dropped: a rule that currently matches nothing is not
    // news, and keeping it would bury the rules that do.
    groups: groups.filter((g) => g.count > 0),
    totals,
    unmeasurable: ALERT_RULES.filter((r) => r.unmeasurable).map((r) => ({
      label: r.label,
      reason: r.unmeasurable!.reason,
      phase: r.unmeasurable!.phase,
    })),
    disabledRules: ALERT_RULES.filter((r) => disabled.has(r.id)).map((r) => r.label),
    reminders: {
      available: false,
      reason:
        "Reminder history lives in Outlook. The Desktop COM bridge that reads " +
        "and sends it is not built yet, so no send counts are reported.",
      phase: "Phase 3",
    },
  };
}

/** Neon path — one indexed query per rule, all issued concurrently. */
async function fromSql(now: Date): Promise<AlertGroup[]> {
  const today = isoDay(now);

  const results = await Promise.all(
    MEASURABLE_RULES.map((rule) =>
      query<{
        container_number: string;
        last_free_day: Date | null;
        days_remaining: number | null;
        appointment_date: Date | null;
        trucker: string | null;
        terminal: string | null;
        status: string;
        total: number;
      }>(
        // COUNT(*) OVER() returns the full match count alongside the capped
        // sample, so one round trip answers both "how many" and "which ones".
        `SELECT container_number,
                last_free_day,
                (last_free_day - $1::date) AS days_remaining,
                appointment_date,
                trucker,
                terminal,
                COALESCE(status_override, src_status, 'Pending') AS status,
                COUNT(*) OVER()::int AS total
           FROM containers
          WHERE ${rule.sql}
          ORDER BY last_free_day NULLS LAST, container_number
          LIMIT ${SAMPLE_LIMIT}`,
        rule.params({ today, active: ACTIVE_STATUSES, now }),
      ),
    ),
  );

  return MEASURABLE_RULES.map((rule, index) => {
    const { rows } = results[index]!;
    return {
      id: rule.id,
      label: rule.label,
      description: rule.description,
      severity: rule.severity,
      action: rule.action,
      count: rows[0]?.total ?? 0,
      rows: rows.map((row) => ({
        containerNumber: row.container_number,
        lastFreeDay: pgDate(row.last_free_day),
        daysRemaining: row.days_remaining,
        appointmentDate: pgDate(row.appointment_date),
        trucker: row.trucker,
        terminal: row.terminal,
        status: row.status,
      })),
    };
  });
}

/** Sheet path — the rows are already in memory, so filter them there. */
export function fromContainers(containers: Container[], now: Date): AlertGroup[] {
  return MEASURABLE_RULES.map((rule) => {
    const matched = containers
      .filter((c) => rule.match(c, now))
      .sort((a, b) => (a.lastFreeDay ?? "9999").localeCompare(b.lastFreeDay ?? "9999"));

    return {
      id: rule.id,
      label: rule.label,
      description: rule.description,
      severity: rule.severity,
      action: rule.action,
      count: matched.length,
      rows: matched.slice(0, SAMPLE_LIMIT).map((c) => ({
        containerNumber: c.containerNumber,
        lastFreeDay: c.lastFreeDay,
        daysRemaining: daysTo(c.lastFreeDay, now),
        appointmentDate: c.appointmentDate,
        trucker: c.trucker,
        terminal: c.terminal,
        status: c.status,
      })),
    };
  });
}

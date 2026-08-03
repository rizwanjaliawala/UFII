import { LFD_THRESHOLDS } from "./constants.js";
import type { Container, LfdRisk } from "./types/container.js";

/**
 * The LFD clock.
 *
 * Every urgency signal in the application resolves through this file, so
 * "what counts as critical" has exactly one definition.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Whole days from today until an ISO date, both anchored to midnight.
 *
 * The anchoring matters. A naive `(lfd - now) / 86400000` makes a container
 * whose LFD is today at 17:00 read as 0.7 days and one due yesterday read as
 * -0.3 — the rounding error lands precisely on the most urgent records.
 */
export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / MS_PER_DAY);
}

/** Container has physically left the terminal — demurrage stops accruing. */
function hasLeftTerminal(container: Pick<Container, "status" | "gateOutDate">): boolean {
  return (
    container.gateOutDate !== null ||
    container.status === "Picked Up" ||
    container.status === "Delivered" ||
    container.status === "Empty Returned" ||
    container.status === "Closed"
  );
}

/**
 * Risk band for a container.
 *
 * A container that has already gated out is `cleared` regardless of its LFD.
 * Demurrage stops at gate-out, so showing those as overdue would be false
 * urgency — and a board that cries wolf gets ignored within a week.
 */
export function lfdRisk(
  container: Pick<Container, "status" | "gateOutDate" | "lastFreeDay">,
  now: Date = new Date(),
): LfdRisk {
  if (hasLeftTerminal(container)) return "cleared";
  if (!container.lastFreeDay) return "safe";

  const days = daysUntil(container.lastFreeDay, now);
  if (days < LFD_THRESHOLDS.critical) return "overdue";
  if (days <= LFD_THRESHOLDS.critical) return "critical";
  if (days <= LFD_THRESHOLDS.warning) return "warning";
  return "safe";
}

export const RISK_LABEL: Record<LfdRisk, string> = {
  overdue: "Overdue",
  critical: "LFD Today",
  warning: "LFD Approaching",
  safe: "On Time",
  cleared: "Cleared",
};

/** Sort weight — lower is more urgent. */
export const RISK_ORDER: Record<LfdRisk, number> = {
  overdue: 0,
  critical: 1,
  warning: 2,
  safe: 3,
  cleared: 4,
};

/** Comparator for the LFD Risk Board and container lists: most urgent first. */
export function byUrgency(
  a: Pick<Container, "status" | "gateOutDate" | "lastFreeDay">,
  b: Pick<Container, "status" | "gateOutDate" | "lastFreeDay">,
  now: Date = new Date(),
): number {
  const ra = RISK_ORDER[lfdRisk(a, now)];
  const rb = RISK_ORDER[lfdRisk(b, now)];
  if (ra !== rb) return ra - rb;

  const da = a.lastFreeDay ? daysUntil(a.lastFreeDay, now) : Number.MAX_SAFE_INTEGER;
  const db = b.lastFreeDay ? daysUntil(b.lastFreeDay, now) : Number.MAX_SAFE_INTEGER;
  return da - db;
}

/** Countdown label: "2d left", "TODAY", "3d over". */
export function freeTimeLabel(
  container: Pick<Container, "status" | "gateOutDate" | "lastFreeDay">,
  now: Date = new Date(),
): string {
  if (!container.lastFreeDay) return "—";
  if (hasLeftTerminal(container)) return "Cleared";

  const days = daysUntil(container.lastFreeDay, now);
  if (days === 0) return "TODAY";
  if (days < 0) return `${Math.abs(days)}d over`;
  return `${days}d left`;
}

/** Days accrued past LFD while still at the terminal — drives demurrage. */
export function demurrageDays(
  container: Pick<Container, "status" | "gateOutDate" | "lastFreeDay">,
  now: Date = new Date(),
): number {
  if (!container.lastFreeDay) return 0;
  const end = container.gateOutDate ? new Date(container.gateOutDate) : now;
  const days = -daysUntil(container.lastFreeDay, end);
  return Math.max(0, days);
}

/** Days held between gate-out and empty return — drives detention. */
export function detentionDays(
  container: Pick<Container, "gateOutDate" | "emptyReturnDate">,
  freeDays: number,
  now: Date = new Date(),
): number {
  if (!container.gateOutDate) return 0;
  const end = container.emptyReturnDate ? new Date(container.emptyReturnDate) : now;
  const held = Math.floor(
    (end.getTime() - new Date(container.gateOutDate).getTime()) / MS_PER_DAY,
  );
  return Math.max(0, held - freeDays);
}

/** No movement in `days` and not yet closed (doc 03 §Needs Attention). */
export function isStale(
  container: Pick<Container, "status" | "updatedDate">,
  days = 3,
  now: Date = new Date(),
): boolean {
  if (container.status === "Closed" || container.status === "Empty Returned") return false;
  return now.getTime() - new Date(container.updatedDate).getTime() > days * MS_PER_DAY;
}

import { DEFAULT_CURRENCY } from "./constants.js";

/** Display formatting. Pure, locale-aware, trivially testable. */

export function formatCurrency(
  amount: number | null,
  currency: string = DEFAULT_CURRENCY,
  compact = false,
): string {
  if (amount === null || !Number.isFinite(amount)) return "—";
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  });
}

/** "Sep 4" — compact date for dense tables. */
export function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Sep 4, 2025" */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Sep 4, 3:42 PM" — for timestamps, which are instants not calendar days. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "3h ago", "2d ago" — activity feeds. */
export function formatRelative(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 0) return "just now";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

export function formatPercent(ratio: number | null, decimals = 0): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

/** "6 days", "1 day" — day counts appear constantly in D&D contexts. */
export function formatDays(days: number | null): string {
  if (days === null || !Number.isFinite(days)) return "—";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

export function truncate(text: string | null, max = 120): string {
  if (!text) return "—";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  Clock,
  Database,
  Info,
  RefreshCw,
  Ship,
  TriangleAlert,
} from "lucide-react";
import clsx from "clsx";
import { formatContainerNumber, formatDateShort, formatRelative } from "@tms/shared";
import { api, type DashboardSummary } from "../services/api";

/**
 * Dashboard — the operations command centre (doc 03).
 *
 * One request supplies every widget, so the page makes a single round trip.
 * Figures are computed from real container records; sections whose data source
 * is not yet connected say so explicitly rather than rendering a zero, because
 * "0" reads as "nothing owing" when the truth is "not measured yet".
 */

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } },
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .getDashboard()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading && !data) return <DashboardSkeleton />;
  if (error && !data) return <DashboardError message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5"
    >
      {/* ---- Header ---- */}
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[var(--text-page-title)] font-bold text-[var(--color-text-primary)]">
            Dashboard
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--text-body)] text-[var(--color-text-secondary)]">
            <Database size={13} aria-hidden />
            {data.source.containers.toLocaleString("en-US")} containers from{" "}
            <span className="font-medium text-[var(--color-text-primary)]">
              {data.source.kind === "neon" ? "the database" : "the source sheets"}
            </span>
            {data.source.loadedAt && <>· loaded {formatRelative(data.source.loadedAt)}</>}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[0.8rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} aria-hidden />
          Refresh
        </button>
      </motion.div>

      {/* ---- KPI row ---- */}
      <motion.div variants={rise} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="Active containers"
          value={data.kpis.activeContainers}
          hint={`${data.kpis.atPort} at port · ${data.kpis.inTransit} moving`}
          icon={Boxes}
        />
        <Kpi
          label="Past Last Free Day"
          value={data.kpis.overdue}
          hint="Demurrage accruing now"
          icon={TriangleAlert}
          tone={data.kpis.overdue > 0 ? "danger" : "success"}
        />
        <Kpi
          label="LFD due today"
          value={data.kpis.lfdDueToday}
          hint="Must move today"
          icon={Clock}
          tone={data.kpis.lfdDueToday > 0 ? "warning" : "neutral"}
        />
        <Kpi
          label="Appointments today"
          value={data.kpis.appointmentsToday}
          hint={`${data.kpis.arrivingToday} vessel arrivals`}
          icon={CalendarClock}
        />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* ---- Needs attention ---- */}
        <motion.section variants={rise} className="card p-[var(--spacing-card)] xl:col-span-1">
          <h2 className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
            Needs attention
          </h2>
          <p className="mt-1 text-[0.76rem] text-[var(--color-text-secondary)]">
            Each item links to the containers behind it.
          </p>

          {data.attention.length === 0 ? (
            <p className="mt-5 rounded-[var(--radius-sm)] bg-[var(--color-success-wash)] px-3 py-4 text-center text-[0.8rem] text-[var(--color-success)]">
              Nothing needs attention right now.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-1.5">
              {data.attention.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.href}
                    className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-transparent px-2.5 py-2 transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-surface-sunk)]"
                  >
                    <span
                      className={clsx(
                        "data w-9 shrink-0 text-right text-[1.05rem] font-bold",
                        item.severity === "critical"
                          ? "text-[var(--color-danger)]"
                          : item.severity === "warning"
                            ? "text-[var(--color-warning)]"
                            : "text-[var(--color-text-secondary)]",
                      )}
                    >
                      {item.count}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.82rem] font-medium text-[var(--color-text-primary)]">
                        {item.label}
                      </span>
                      <span className="block truncate text-[0.7rem] text-[var(--color-text-secondary)]">
                        {item.hint}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* ---- LFD risk board ---- */}
        <motion.section variants={rise} className="card p-[var(--spacing-card)] xl:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
              LFD risk board
            </h2>
            <div className="flex items-center gap-3 text-[0.7rem]">
              <RiskDot tone="danger" label={`${data.risk.overdue} overdue`} />
              <RiskDot tone="danger" label={`${data.risk.critical} today`} />
              <RiskDot tone="warning" label={`${data.risk.warning} soon`} />
              <RiskDot tone="success" label={`${data.risk.safe} on time`} />
            </div>
          </div>

          {data.lfdBoard.length === 0 ? (
            <p className="mt-5 rounded-[var(--radius-sm)] bg-[var(--color-success-wash)] px-3 py-6 text-center text-[0.8rem] text-[var(--color-success)]">
              No container is at or near its Last Free Day.
            </p>
          ) : (
            <ul className="mt-4 flex max-h-[320px] flex-col gap-1 overflow-y-auto pr-1">
              {data.lfdBoard.map((item) => (
                <li key={item.containerNumber}>
                  <Link
                    to={`/containers/${item.containerNumber}`}
                    className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-1.5 transition-colors hover:bg-[var(--color-surface-sunk)]"
                  >
                    <span
                      className={clsx(
                        "h-2 w-2 shrink-0 rounded-full",
                        item.risk === "warning"
                          ? "bg-[var(--color-warning)]"
                          : "bg-[var(--color-danger)]",
                      )}
                    />
                    <span className="data w-[7.5rem] shrink-0 text-[0.78rem] text-[var(--color-text-primary)]">
                      {formatContainerNumber(item.containerNumber)}
                    </span>
                    <span
                      className={clsx(
                        "data w-16 shrink-0 text-[0.75rem] font-semibold",
                        item.risk === "warning"
                          ? "text-[var(--color-warning)]"
                          : "text-[var(--color-danger)]",
                      )}
                    >
                      {item.daysRemaining === null
                        ? "—"
                        : item.daysRemaining === 0
                          ? "TODAY"
                          : item.daysRemaining < 0
                            ? `${Math.abs(item.daysRemaining)}d over`
                            : `${item.daysRemaining}d`}
                    </span>
                    <span className="data hidden w-16 shrink-0 text-[0.72rem] text-[var(--color-text-secondary)] sm:block">
                      {formatDateShort(item.lastFreeDay)}
                    </span>
                    <span className="truncate text-[0.75rem] text-[var(--color-text-secondary)]">
                      {item.trucker ?? "No trucker"}
                    </span>
                    <span className="ml-auto hidden max-w-[140px] truncate text-[0.72rem] text-[var(--color-text-disabled)] lg:block">
                      {item.terminal ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      {/* ---- Breakdowns ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Breakdown title="By trucker" rows={data.byTrucker} icon={Ship} />
        <Breakdown title="By terminal" rows={data.byTerminal} icon={Boxes} />
        <Breakdown title="By port of discharge" rows={data.byPod} icon={Ship} />
      </div>

      {/* ---- Appointments ---- */}
      <motion.section variants={rise} className="card p-[var(--spacing-card)]">
        <h2 className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
          Appointments this week
        </h2>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {data.upcoming.map((day, index) => {
            const max = Math.max(...data.upcoming.map((d) => d.count), 1);
            return (
              <div key={day.date} className="flex flex-col items-center gap-2">
                <div className="flex h-24 w-full items-end">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(4, (day.count / max) * 100)}%` }}
                    transition={{ duration: 0.4, delay: index * 0.04 }}
                    className={clsx(
                      "w-full rounded-t-[var(--radius-sm)]",
                      index === 0
                        ? "bg-[var(--color-accent)]"
                        : "bg-[var(--color-primary)]/55",
                    )}
                  />
                </div>
                <span className="data text-[0.8rem] font-semibold text-[var(--color-text-primary)]">
                  {day.count}
                </span>
                <span className="text-[0.66rem] text-[var(--color-text-secondary)]">
                  {index === 0 ? "Today" : day.label}
                </span>
              </div>
            );
          })}
        </div>
      </motion.section>

      {/* ---- Not yet connected ---- */}
      {data.unavailable.length > 0 && (
        <motion.section variants={rise} className="card p-[var(--spacing-card)]">
          <h2 className="flex items-center gap-2 text-[0.9rem] font-semibold text-[var(--color-text-primary)]">
            <Info size={15} className="text-[var(--color-text-secondary)]" aria-hidden />
            Not yet connected
          </h2>
          <p className="mt-1 text-[0.74rem] text-[var(--color-text-secondary)]">
            These are reported as unavailable rather than zero, so a missing
            data source is never mistaken for a clean result.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.unavailable.map((item) => (
              <li
                key={item.module}
                className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] px-3 py-2"
              >
                <span className="block text-[0.78rem] font-medium text-[var(--color-text-primary)]">
                  {item.module}
                </span>
                <span className="block text-[0.7rem] text-[var(--color-text-secondary)]">
                  {item.reason}
                </span>
                <span className="mt-0.5 block text-[0.68rem] font-medium text-[var(--color-accent)]">
                  {item.phase}
                </span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}

/* ---------------- Pieces ---------------- */

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Boxes;
  tone?: "neutral" | "danger" | "warning" | "success";
}) {
  const valueColor = {
    neutral: "text-[var(--color-text-primary)]",
    danger: "text-[var(--color-danger)]",
    warning: "text-[var(--color-warning)]",
    success: "text-[var(--color-success)]",
  }[tone];

  return (
    <div className="card card-interactive p-[var(--spacing-card)]">
      <div className="flex items-center gap-2 text-[0.7rem] font-medium tracking-wide text-[var(--color-text-secondary)] uppercase">
        <Icon size={14} aria-hidden />
        {label}
      </div>
      <div className={clsx("data mt-2 text-[1.9rem] leading-none font-bold", valueColor)}>
        {value.toLocaleString("en-US")}
      </div>
      <p className="mt-1.5 text-[0.72rem] text-[var(--color-text-secondary)]">{hint}</p>
    </div>
  );
}

function RiskDot({
  tone,
  label,
}: {
  tone: "danger" | "warning" | "success";
  label: string;
}) {
  const color = {
    danger: "bg-[var(--color-danger)]",
    warning: "bg-[var(--color-warning)]",
    success: "bg-[var(--color-success)]",
  }[tone];
  return (
    <span className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
      <span className={clsx("h-2 w-2 rounded-full", color)} />
      {label}
    </span>
  );
}

function Breakdown({
  title,
  rows,
  icon: Icon,
}: {
  title: string;
  rows: { name: string; total: number; atRisk: number }[];
  icon: typeof Boxes;
}) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <motion.section variants={rise} className="card p-[var(--spacing-card)]">
      <h2 className="flex items-center gap-2 text-[0.9rem] font-semibold text-[var(--color-text-primary)]">
        <Icon size={15} className="text-[var(--color-text-secondary)]" aria-hidden />
        {title}
      </h2>
      <ul className="mt-3.5 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[0.78rem] text-[var(--color-text-primary)]">
                {row.name}
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                {row.atRisk > 0 && (
                  <span className="data text-[0.7rem] font-semibold text-[var(--color-danger)]">
                    {row.atRisk} at risk
                  </span>
                )}
                <span className="data text-[0.75rem] text-[var(--color-text-secondary)]">
                  {row.total}
                </span>
              </span>
            </div>
            {/* Total bar with the at-risk portion overlaid, so the proportion
                is readable without a second chart. */}
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunk)]">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-primary)]/45"
                style={{ width: `${(row.total / max) * 100}%` }}
              />
              {row.atRisk > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-danger)]"
                  style={{ width: `${(row.atRisk / max) * 100}%` }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="shimmer h-12 w-64 rounded-[var(--radius-sm)]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="shimmer h-28 rounded-[var(--radius)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="shimmer h-80 rounded-[var(--radius)]" />
        <div className="shimmer h-80 rounded-[var(--radius)] xl:col-span-2" />
      </div>
    </div>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-danger-wash)] text-[var(--color-danger)]">
        <AlertTriangle size={24} aria-hidden />
      </span>
      <div>
        <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
          Could not load the dashboard
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-[var(--text-body)] text-[var(--color-text-secondary)]">
          {message}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
      >
        Retry
      </button>
    </div>
  );
}

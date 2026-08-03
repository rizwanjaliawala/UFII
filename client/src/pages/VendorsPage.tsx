import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Info, RefreshCw, Truck } from "lucide-react";
import clsx from "clsx";
import { formatCurrency, formatPercent } from "@tms/shared";
import { api, type VendorKpi, type VendorSummary } from "../services/api";
import { ExportButton } from "../components/ExportButton";
import { VendorDetailDrawer } from "../features/vendors/VendorDetailDrawer";

/**
 * Vendor Management (doc 03 §Vendor Management).
 *
 * Attribution is split on purpose and labelled in the UI, because the two
 * numbers answer different questions:
 *   "as responsible party" — who absorbed the cost
 *   "as trucker"          — who was hauling when it was incurred
 * Showing only one would misattribute either performance or spend.
 */

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } },
};

export function VendorsPage() {
  const [data, setData] = useState<VendorSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"volume" | "score" | "cost">("volume");
  const [selected, setSelected] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getVendors()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading && !data) return <VendorSkeleton />;
  if (error && !data) return <VendorError message={error} onRetry={load} />;
  if (!data) return null;

  const vendors = [...data.vendors].sort((a, b) => {
    if (sortBy === "score") return (b.score ?? -1) - (a.score ?? -1);
    if (sortBy === "cost") return b.ddCostResponsible - a.ddCostResponsible;
    return b.totalContainers - a.totalContainers;
  });

  return (
    <motion.div initial="hidden" animate="show" className="flex flex-col gap-5">
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[var(--text-page-title)] font-bold text-[var(--color-text-primary)]">
            Vendor Management
          </h1>
          <p className="mt-1.5 text-[var(--text-body)] text-[var(--color-text-secondary)]">
            {data.totals.vendors} vendors · {formatCurrency(data.totals.ddCost)} D&amp;D
            attributed · {formatCurrency(data.totals.credits)} credited back
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
            {(
              [
                ["volume", "Volume"],
                ["score", "Score"],
                ["cost", "D&D cost"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSortBy(value)}
                className={clsx(
                  "rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-1.5 text-[0.76rem] transition-colors",
                  sortBy === value
                    ? "bg-[var(--color-primary)] font-semibold text-white"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <ExportButton href={api.vendorsExportUrl()} count={data.totals.vendors} />
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[0.8rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)] disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} aria-hidden />
            Refresh
          </button>
        </div>
      </motion.div>

      <motion.div variants={rise} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {vendors.map((vendor) => (
          <VendorCard
            key={vendor.key}
            vendor={vendor}
            onOpen={() => setSelected(vendor.key)}
          />
        ))}
      </motion.div>

      <VendorDetailDrawer vendorKey={selected} onClose={() => setSelected(null)} />

      {data.unavailable.length > 0 && (
        <motion.section variants={rise} className="card p-[var(--spacing-card)]">
          <h2 className="flex items-center gap-2 text-[0.9rem] font-semibold text-[var(--color-text-primary)]">
            <Info size={15} className="text-[var(--color-text-secondary)]" aria-hidden />
            KPIs not yet measurable
          </h2>
          <p className="mt-1 text-[0.74rem] text-[var(--color-text-secondary)]">
            Reported as unavailable rather than zero — a 0-hour response time
            would read as instant, which is the opposite of the truth.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.unavailable.map((item) => (
              <li
                key={item.metric}
                className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] px-3 py-2"
              >
                <span className="block text-[0.78rem] font-medium text-[var(--color-text-primary)]">
                  {item.metric}
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

function VendorCard({ vendor, onOpen }: { vendor: VendorKpi; onOpen: () => void }) {
  const scoreTone =
    vendor.score === null
      ? "text-[var(--color-text-disabled)]"
      : vendor.score >= 80
        ? "text-[var(--color-success)]"
        : vendor.score >= 60
          ? "text-[var(--color-warning)]"
          : "text-[var(--color-danger)]";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="card card-interactive flex cursor-pointer flex-col gap-4 p-[var(--spacing-card)] text-left focus:ring-2 focus:ring-[var(--color-primary)] focus:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-wash)] text-[var(--color-primary)]">
            <Truck size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.95rem] font-semibold text-[var(--color-text-primary)]">
              {vendor.name}
            </p>
            <p className="text-[0.72rem] text-[var(--color-text-secondary)]">
              {vendor.totalContainers.toLocaleString("en-US")} containers ·{" "}
              {vendor.activeContainers} active
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className={clsx("data text-[1.6rem] leading-none font-bold", scoreTone)}>
            {vendor.score ?? "—"}
          </div>
          <div className="text-[0.62rem] tracking-wide text-[var(--color-text-secondary)] uppercase">
            Score
          </div>
        </div>
      </div>

      {vendor.score === null && (
        <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-sunk)] px-2.5 py-1.5 text-[0.7rem] text-[var(--color-text-secondary)]">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
          Too few completed moves to score fairly ({vendor.onTimeSample}).
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Metric
          label="On-time pickup"
          value={
            vendor.onTimePickupRate === null
              ? "—"
              : formatPercent(vendor.onTimePickupRate)
          }
          hint={`${vendor.onTimeSample} completed moves`}
          bar={vendor.onTimePickupRate}
        />
        <Metric
          label="At risk now"
          value={String(vendor.atRisk)}
          hint={`${vendor.overdue} past LFD`}
          tone={vendor.atRisk > 0 ? "danger" : "neutral"}
        />
        <Metric
          label="D&D as responsible"
          value={formatCurrency(vendor.ddCostResponsible)}
          hint={`${vendor.invoiceCount} invoices — cost they absorbed`}
          tone={vendor.ddCostResponsible > 0 ? "danger" : "neutral"}
        />
        <Metric
          label="D&D as trucker"
          value={formatCurrency(vendor.ddCostAsTrucker)}
          hint="Incurred while they hauled"
        />
      </div>

      {vendor.creditNoteTotal > 0 && (
        <p className="rounded-[var(--radius-sm)] bg-[var(--color-success-wash)] px-2.5 py-1.5 text-[0.72rem] text-[var(--color-success)]">
          {formatCurrency(vendor.creditNoteTotal)} recovered via credit notes
        </p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  bar,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  bar?: number | null;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[0.64rem] tracking-wide text-[var(--color-text-secondary)] uppercase">
        {label}
      </span>
      <span
        className={clsx(
          "data text-[0.95rem] font-semibold",
          tone === "danger"
            ? "text-[var(--color-danger)]"
            : "text-[var(--color-text-primary)]",
        )}
      >
        {value}
      </span>
      {bar !== undefined && bar !== null && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunk)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(bar * 100)}%` }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className={clsx(
              "h-full rounded-full",
              bar >= 0.9
                ? "bg-[var(--color-success)]"
                : bar >= 0.75
                  ? "bg-[var(--color-primary)]"
                  : "bg-[var(--color-warning)]",
            )}
          />
        </div>
      )}
      <span className="truncate text-[0.66rem] text-[var(--color-text-disabled)]">{hint}</span>
    </div>
  );
}

function VendorSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="shimmer h-12 w-72 rounded-[var(--radius-sm)]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="shimmer h-56 rounded-[var(--radius)]" />
        ))}
      </div>
    </div>
  );
}

function VendorError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-danger-wash)] text-[var(--color-danger)]">
        <AlertTriangle size={24} aria-hidden />
      </span>
      <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
        Could not load vendors
      </p>
      <p className="max-w-md text-[var(--text-body)] text-[var(--color-text-secondary)]">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
      >
        Retry
      </button>
    </div>
  );
}

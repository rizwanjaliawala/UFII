import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, Info, RefreshCw, ScanLine } from "lucide-react";
import clsx from "clsx";
import { formatContainerNumber, formatDateShort, type Container } from "@tms/shared";
import { api } from "../services/api";
import { ExportButton } from "../components/ExportButton";

/**
 * PU / LFD (doc 03 §PU-LFD).
 *
 * Two jobs on one screen: the Last Free Day countdown, and the state of
 * pickup numbers.
 *
 * A finding that shapes this page: profiling all 14 source tabs confirmed
 * Source Sheet 1 has NO pickup-number column. Every PU therefore arrives by
 * OCR from an Outlook screenshot (Phase 3) or by manual entry. The PU panel
 * says so plainly rather than showing an empty column that looks like a bug.
 */

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } },
};

type Band = "overdue" | "critical" | "warning" | "safe";

const BANDS: { id: Band; label: string; tone: string; description: string }[] = [
  {
    id: "overdue",
    label: "Past LFD",
    tone: "text-[var(--color-danger)]",
    description: "Demurrage accruing now",
  },
  {
    id: "critical",
    label: "Due today",
    tone: "text-[var(--color-danger)]",
    description: "Must move today",
  },
  {
    id: "warning",
    label: "Within 2 days",
    tone: "text-[var(--color-warning)]",
    description: "Book an appointment",
  },
  {
    id: "safe",
    label: "On time",
    tone: "text-[var(--color-success)]",
    description: "Inside free time",
  },
];

export function PuLfdPage() {
  const [band, setBand] = useState<Band>("overdue");
  const [rows, setRows] = useState<Container[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [missingPu, setMissingPu] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.listContainers({ risk: band, sort: "lfd", direction: "asc", pageSize: 100 }),
      api.getSummary(),
      api.getDashboard(),
    ])
      .then(([page, summary, dashboard]) => {
        setRows(page.rows);
        setCounts(summary.risk);
        setMissingPu(
          dashboard.attention.find((a) => a.id === "missing-pu")?.count ?? 0,
        );
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [band]);

  const withPu = useMemo(() => rows.filter((r) => r.pickupNumber).length, [rows]);

  return (
    <motion.div initial="hidden" animate="show" className="flex flex-col gap-5">
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[var(--text-page-title)] font-bold text-[var(--color-text-primary)]">
            PU / LFD
          </h1>
          <p className="mt-1.5 text-[var(--text-body)] text-[var(--color-text-secondary)]">
            Last Free Day countdown and pickup-number status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            href={api.containersExportUrl({ risk: band, sort: "lfd", direction: "asc" })}
            count={counts[band] ?? 0}
          />
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

      {/* ---- PU status ---- */}
      <motion.section variants={rise} className="card p-[var(--spacing-card)]">
        <h2 className="flex items-center gap-2 text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
          <ScanLine size={16} className="text-[var(--color-accent)]" aria-hidden />
          Pickup numbers
        </h2>
        <div className="mt-3 flex flex-wrap items-start gap-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-3">
          <Info size={15} className="mt-0.5 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[0.82rem] text-[var(--color-text-primary)]">
              {missingPu === null
                ? "Checking…"
                : `${missingPu.toLocaleString("en-US")} active containers have no pickup number.`}
            </p>
            <p className="mt-1 text-[0.74rem] text-[var(--color-text-secondary)]">
              Source Sheet 1 contains no PU column — verified across all 14
              monthly tabs. Numbers arrive by OCR from Outlook screenshots
              (Phase 3), or can be entered by hand today from Container 360.
            </p>
          </div>
          <span className="rounded-full bg-[var(--color-accent-wash)] px-2.5 py-1 text-[0.68rem] font-medium text-[var(--color-accent)]">
            OCR queue — Phase 3
          </span>
        </div>
      </motion.section>

      {/* ---- LFD bands ---- */}
      <motion.div variants={rise} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BANDS.map((b) => (
          <button
            key={b.id}
            onClick={() => setBand(b.id)}
            className={clsx(
              "card card-interactive p-4 text-left transition-colors",
              band === b.id && "border-[var(--color-primary)]",
            )}
            aria-pressed={band === b.id}
          >
            <div className="flex items-center gap-1.5 text-[0.66rem] font-medium tracking-wide text-[var(--color-text-secondary)] uppercase">
              <Clock size={12} aria-hidden />
              {b.label}
            </div>
            <div className={clsx("data mt-1.5 text-[1.6rem] leading-none font-bold", b.tone)}>
              {(counts[b.id] ?? 0).toLocaleString("en-US")}
            </div>
            <p className="mt-1 text-[0.68rem] text-[var(--color-text-secondary)]">
              {b.description}
            </p>
          </button>
        ))}
      </motion.div>

      {/* ---- List ---- */}
      <motion.section variants={rise} className="glass-solid overflow-hidden rounded-[var(--radius)] shadow-[var(--shadow-card)]">
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-[0.9rem] font-semibold text-[var(--color-text-primary)]">
            {BANDS.find((b) => b.id === band)?.label}
          </h2>
          <span className="text-[0.74rem] text-[var(--color-text-secondary)]">
            {rows.length} shown · {withPu} with a PU
          </span>
        </div>

        {error ? (
          <p className="flex items-center gap-2 px-4 py-8 text-[0.82rem] text-[var(--color-danger)]">
            <AlertTriangle size={15} aria-hidden />
            {error}
          </p>
        ) : loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="shimmer h-9 rounded-[var(--radius-sm)]" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-[0.85rem] text-[var(--color-text-secondary)]">
            No containers in this band.
          </p>
        ) : (
          <div className="max-h-[52vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-left">
              <thead className="sticky top-0 z-10">
                <tr>
                  {["Container", "LFD", "PU number", "Trucker", "Terminal"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunk)] px-3 py-2 text-[0.66rem] font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.containerNumber}
                    className={clsx(
                      "transition-colors hover:bg-[var(--color-accent-wash)]",
                      index % 2 === 1 && "bg-[var(--color-surface-sunk)]/40",
                    )}
                  >
                    <td className="border-b border-[var(--color-border)] px-3 py-2">
                      <Link
                        to={`/containers/${row.containerNumber}`}
                        className="data text-[0.8rem] font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                      >
                        {formatContainerNumber(row.containerNumber)}
                      </Link>
                    </td>
                    <td className="data border-b border-[var(--color-border)] px-3 py-2 text-[0.78rem] text-[var(--color-text-secondary)]">
                      {formatDateShort(row.lastFreeDay)}
                    </td>
                    <td className="border-b border-[var(--color-border)] px-3 py-2">
                      {row.pickupNumber ? (
                        <span className="data text-[0.78rem] text-[var(--color-text-primary)]">
                          {row.pickupNumber}
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--color-surface-sunk)] px-2 py-0.5 text-[0.68rem] text-[var(--color-text-disabled)]">
                          awaiting
                        </span>
                      )}
                    </td>
                    <td className="border-b border-[var(--color-border)] px-3 py-2 text-[0.78rem] text-[var(--color-text-secondary)]">
                      {row.trucker ?? "—"}
                    </td>
                    <td className="max-w-[180px] truncate border-b border-[var(--color-border)] px-3 py-2 text-[0.78rem] text-[var(--color-text-secondary)]">
                      {row.terminal ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}

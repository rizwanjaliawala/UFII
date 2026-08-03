import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ExternalLink, Info, X } from "lucide-react";
import { formatCurrency, formatPercent } from "@tms/shared";
import { api, type VendorDetail } from "../../services/api";

/**
 * Vendor drill-down (doc 03 §Vendor Management).
 *
 * Two series on one axis pair: containers moved (bars, left) and on-time rate
 * (line, right). They answer different questions and are read together — a
 * vendor whose on-time rate improves while volume collapses has not improved.
 */

export function VendorDetailDrawer({
  vendorKey,
  onClose,
}: {
  vendorKey: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<VendorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!vendorKey) return;
    setLoading(true);
    setDetail(null);
    api
      .getVendorDetail(vendorKey)
      .then((result) => {
        setDetail(result);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [vendorKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kpi = detail?.kpi;

  return (
    <AnimatePresence>
      {vendorKey && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm"
        >
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Vendor detail"
            className="glass-solid flex h-full w-full max-w-2xl flex-col overflow-hidden shadow-[var(--shadow-modal)]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-[1.15rem] font-bold text-[var(--color-text-primary)]">
                  {kpi?.name ?? "Loading…"}
                </h2>
                {kpi && (
                  <p className="mt-0.5 text-[0.78rem] text-[var(--color-text-secondary)]">
                    {kpi.totalContainers.toLocaleString("en-US")} containers ·{" "}
                    {kpi.activeContainers} active · {kpi.completed.toLocaleString("en-US")}{" "}
                    completed
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunk)] hover:text-[var(--color-text-primary)]"
              >
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="flex-1 overflow-auto px-5 py-4">
              {error ? (
                <p className="flex items-center gap-2 py-10 text-[0.85rem] text-[var(--color-danger)]">
                  <AlertTriangle size={16} aria-hidden />
                  {error}
                </p>
              ) : loading || !detail || !kpi ? (
                <div className="flex flex-col gap-3">
                  <div className="shimmer h-24 rounded-[var(--radius)]" />
                  <div className="shimmer h-56 rounded-[var(--radius)]" />
                  <div className="shimmer h-40 rounded-[var(--radius)]" />
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat
                      label="Score"
                      value={kpi.score === null ? "—" : String(kpi.score)}
                      hint={kpi.score === null ? "sample too small" : "0.6 on-time + 0.4 cost"}
                    />
                    <Stat
                      label="On-time"
                      value={
                        kpi.onTimePickupRate === null
                          ? "—"
                          : formatPercent(kpi.onTimePickupRate)
                      }
                      hint={`${kpi.onTimeSample} moves`}
                    />
                    <Stat
                      label="At risk"
                      value={String(kpi.atRisk)}
                      hint={`${kpi.overdue} past LFD`}
                      tone={kpi.atRisk > 0 ? "danger" : undefined}
                    />
                    <Stat
                      label="D&D responsible"
                      value={formatCurrency(kpi.ddCostResponsible)}
                      hint={`${kpi.invoiceCount} invoices`}
                      tone={kpi.ddCostResponsible > 0 ? "danger" : undefined}
                    />
                  </section>

                  <section>
                    <h3 className="text-[0.82rem] font-semibold text-[var(--color-text-primary)]">
                      Volume and on-time rate by month
                    </h3>
                    {detail.trend.length === 0 ? (
                      <p className="mt-2 text-[0.76rem] text-[var(--color-text-secondary)]">
                        No dated movements to plot.
                      </p>
                    ) : (
                      <>
                        <div className="mt-3 h-56">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={detail.trend}
                              margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
                            >
                              <CartesianGrid
                                stroke="var(--color-border)"
                                strokeDasharray="3 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="month"
                                tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }}
                                axisLine={{ stroke: "var(--color-border)" }}
                                tickLine={false}
                              />
                              <YAxis
                                yAxisId="left"
                                tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                yAxisId="right"
                                orientation="right"
                                domain={[0, 1]}
                                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                                tick={{ fontSize: 10, fill: "var(--color-text-secondary)" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                contentStyle={{
                                  background: "var(--color-surface)",
                                  border: "1px solid var(--color-border)",
                                  borderRadius: "var(--radius-sm)",
                                  fontSize: "0.75rem",
                                }}
                                // Recharts types the formatter against its own
                                // ValueType/NameType union; the cast keeps the
                                // callback readable without importing them.
                                formatter={((value: unknown, name: unknown) =>
                                  name === "On-time"
                                    ? [`${Math.round(Number(value) * 100)}%`, name]
                                    : [String(value), name]) as never}
                              />
                              <Bar
                                yAxisId="left"
                                dataKey="containers"
                                name="Containers"
                                fill="var(--color-primary)"
                                radius={[3, 3, 0, 0]}
                              />
                              <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="onTimeRate"
                                name="On-time"
                                stroke="var(--color-accent)"
                                strokeWidth={2}
                                dot={{ r: 2.5 }}
                                // Months below the sample threshold send null;
                                // the line breaks there rather than drawing
                                // through a figure we do not trust.
                                connectNulls={false}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                        <p className="mt-1.5 flex items-start gap-1.5 text-[0.7rem] text-[var(--color-text-secondary)]">
                          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
                          The on-time line breaks in months with fewer than three
                          completed moves — too few to score fairly.
                        </p>
                      </>
                    )}
                  </section>

                  {detail.terminals.length > 0 && (
                    <section>
                      <h3 className="text-[0.82rem] font-semibold text-[var(--color-text-primary)]">
                        Where they operate
                      </h3>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {detail.terminals.map((terminal) => (
                          <li
                            key={terminal.name}
                            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[0.72rem] text-[var(--color-text-secondary)]"
                          >
                            {terminal.name}{" "}
                            <span className="data font-medium text-[var(--color-text-primary)]">
                              {terminal.count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {detail.recentInvoices.length > 0 && (
                    <section>
                      <h3 className="text-[0.82rem] font-semibold text-[var(--color-text-primary)]">
                        Recent D&amp;D invoices
                      </h3>
                      <div className="mt-2 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                        <table className="w-full text-left">
                          <tbody>
                            {detail.recentInvoices.map((invoice, index) => (
                              <tr
                                key={invoice.invoiceNumber}
                                className={index % 2 === 1 ? "bg-[var(--color-surface-sunk)]/50" : ""}
                              >
                                <td className="data px-3 py-2 text-[0.76rem] font-medium text-[var(--color-text-primary)]">
                                  {invoice.invoiceNumber}
                                </td>
                                <td className="px-3 py-2 text-[0.72rem] text-[var(--color-text-secondary)]">
                                  {invoice.containers} container
                                  {invoice.containers === 1 ? "" : "s"}
                                </td>
                                <td className="px-3 py-2 text-[0.72rem] text-[var(--color-text-secondary)]">
                                  {invoice.paymentStatus ?? "—"}
                                </td>
                                <td className="data px-3 py-2 text-right text-[0.76rem] font-medium text-[var(--color-text-primary)]">
                                  {formatCurrency(invoice.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  <Link
                    to={`/containers?trucker=${encodeURIComponent(kpi.name)}`}
                    onClick={onClose}
                    className="flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2.5 text-[0.82rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
                  >
                    <ExternalLink size={14} aria-hidden />
                    Open their {kpi.totalContainers.toLocaleString("en-US")} containers
                  </Link>
                </div>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "danger";
}) {
  return (
    <div className="card p-3">
      <div className="text-[0.62rem] tracking-wide text-[var(--color-text-secondary)] uppercase">
        {label}
      </div>
      <div
        className={
          tone === "danger"
            ? "data mt-1 text-[1.05rem] font-bold text-[var(--color-danger)]"
            : "data mt-1 text-[1.05rem] font-bold text-[var(--color-text-primary)]"
        }
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-[0.64rem] text-[var(--color-text-disabled)]">
        {hint}
      </div>
    </div>
  );
}

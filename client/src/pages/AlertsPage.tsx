import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  BellOff,
  ChevronDown,
  Info,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import clsx from "clsx";
import { formatContainerNumber, formatDateShort } from "@tms/shared";
import { api, type AlertGroup, type AlertRuleSetting, type AlertSummary } from "../services/api";

/**
 * Alerts & Reminders (doc 03 §Alerts).
 *
 * Detection only. Sending runs through Outlook Desktop COM in Phase 3, so the
 * reminder log reports itself unavailable rather than rendering an empty table
 * that would read as "no reminders were needed".
 */

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } },
};

const SEVERITY = {
  critical: {
    label: "Critical",
    dot: "bg-[var(--color-danger)]",
    text: "text-[var(--color-danger)]",
    wash: "bg-[var(--color-danger-wash)]",
  },
  warning: {
    label: "Warning",
    dot: "bg-[var(--color-warning)]",
    text: "text-[var(--color-warning)]",
    wash: "bg-[var(--color-warning-wash)]",
  },
  info: {
    label: "Info",
    dot: "bg-[var(--color-primary)]",
    text: "text-[var(--color-primary)]",
    wash: "bg-[var(--color-primary-wash)]",
  },
} as const;

export function AlertsPage() {
  const [data, setData] = useState<AlertSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getAlerts()
      .then((result) => {
        setData(result);
        // Open the most urgent group by default — the page should land on
        // the thing that needs doing, not on a list of collapsed headers.
        setOpen((current) => current ?? result.groups[0]?.id ?? null);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading && !data) return <AlertsSkeleton />;
  if (error && !data) return <AlertsError message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <motion.div initial="hidden" animate="show" className="flex flex-col gap-5">
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[var(--text-page-title)] font-bold text-[var(--color-text-primary)]">
            Alerts &amp; Reminders
          </h1>
          <p className="mt-1.5 text-[var(--text-body)] text-[var(--color-text-secondary)]">
            {data.totals.containers === 0
              ? "No containers are triggering an alert rule"
              : `${data.totals.containers.toLocaleString("en-US")} containers across ${data.groups.length} active rules`}
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

      <motion.div variants={rise} className="grid grid-cols-3 gap-3">
        {(["critical", "warning", "info"] as const).map((severity) => (
          <div key={severity} className="card flex items-center gap-3 p-4">
            <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", SEVERITY[severity].dot)} />
            <div className="min-w-0">
              <div
                className={clsx(
                  "data text-[1.5rem] leading-none font-bold",
                  data.totals[severity] > 0
                    ? SEVERITY[severity].text
                    : "text-[var(--color-text-disabled)]",
                )}
              >
                {data.totals[severity].toLocaleString("en-US")}
              </div>
              <div className="mt-1 truncate text-[0.68rem] tracking-wide text-[var(--color-text-secondary)] uppercase">
                {SEVERITY[severity].label}
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      {data.groups.length === 0 ? (
        <motion.div variants={rise} className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-success-wash)] text-[var(--color-success)]">
            <BellOff size={24} aria-hidden />
          </span>
          <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
            Nothing needs attention
          </p>
          <p className="max-w-md text-[var(--text-body)] text-[var(--color-text-secondary)]">
            No container currently matches an alert rule.
          </p>
        </motion.div>
      ) : (
        <motion.div variants={rise} className="flex flex-col gap-3">
          {data.groups.map((group) => (
            <AlertCard
              key={group.id}
              group={group}
              open={open === group.id}
              onToggle={() => setOpen(open === group.id ? null : group.id)}
            />
          ))}
        </motion.div>
      )}

      <RuleConfiguration onChanged={load} />

      <motion.section variants={rise} className="card p-[var(--spacing-card)]">
        <h2 className="flex items-center gap-2 text-[0.9rem] font-semibold text-[var(--color-text-primary)]">
          <Bell size={15} className="text-[var(--color-text-secondary)]" aria-hidden />
          Not yet measurable
        </h2>
        <p className="mt-1 text-[0.72rem] text-[var(--color-text-secondary)]">
          Reported rather than shown as zero — a rule that reads 0 because
          nothing feeds it looks like good news.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Unavailable
            label="Reminder log"
            reason={data.reminders.reason}
            phase={data.reminders.phase}
          />
          {data.unmeasurable.map((item) => (
            <Unavailable
              key={item.label}
              label={item.label}
              reason={item.reason}
              phase={item.phase}
            />
          ))}
        </div>
      </motion.section>
    </motion.div>
  );
}

/**
 * Rule configuration (doc 03 §Alerts).
 *
 * Enable/disable only. The predicates stay in code because each exists twice
 * — once as SQL for Neon, once as Node for the sheet path — and a
 * user-authored predicate would be neither testable nor safe to run against
 * the database.
 */
function RuleConfiguration({ onChanged }: { onChanged: () => void }) {
  const [rules, setRules] = useState<AlertRuleSetting[] | null>(null);
  const [editKey, setEditKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .getAlertRules()
      .then((result) => setRules(result.rules))
      .catch(() => setRules([]));
  }, []);

  const toggle = async (rule: AlertRuleSetting) => {
    if (!editKey) {
      setNotice("Enter the edit key — switching a rule off hides containers.");
      return;
    }
    setBusy(rule.ruleId);
    setNotice(null);
    try {
      await api.setAlertRuleEnabled(rule.ruleId, !rule.enabled, editKey);
      setRules((current) =>
        current?.map((r) => (r.ruleId === rule.ruleId ? { ...r, enabled: !r.enabled } : r)) ?? null,
      );
      onChanged();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!rules || rules.length === 0) return null;

  return (
    <motion.section variants={rise} className="card p-[var(--spacing-card)]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <SlidersHorizontal size={15} className="text-[var(--color-text-secondary)]" aria-hidden />
        <span className="text-[0.9rem] font-semibold text-[var(--color-text-primary)]">
          Rule configuration
        </span>
        <span className="text-[0.72rem] text-[var(--color-text-secondary)]">
          {rules.filter((r) => r.enabled && r.measurable).length} of{" "}
          {rules.filter((r) => r.measurable).length} active
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          className={clsx(
            "ml-auto text-[var(--color-text-secondary)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] pt-3">
              <label htmlFor="rule-edit-key" className="text-[0.78rem] text-[var(--color-text-primary)]">
                Edit key
              </label>
              <input
                id="rule-edit-key"
                type="password"
                inputMode="numeric"
                value={editKey}
                onChange={(event) => setEditKey(event.target.value)}
                placeholder="••••"
                className="w-24 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-center text-[0.82rem] tracking-[0.3em] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
              />
              {notice && (
                <span className="text-[0.74rem] font-medium text-[var(--color-accent)]">{notice}</span>
              )}
            </div>

            <ul className="mt-3 flex flex-col gap-2">
              {rules.map((rule) => (
                <li
                  key={rule.ruleId}
                  className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8rem] font-medium text-[var(--color-text-primary)]">
                      {rule.label}
                    </p>
                    <p className="text-[0.72rem] text-[var(--color-text-secondary)]">
                      {rule.measurable ? rule.description : rule.unmeasurableReason}
                    </p>
                  </div>

                  {rule.measurable ? (
                    <button
                      onClick={() => toggle(rule)}
                      disabled={busy === rule.ruleId}
                      role="switch"
                      aria-checked={rule.enabled}
                      aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.label}`}
                      className={clsx(
                        "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
                        rule.enabled
                          ? "bg-[var(--color-primary)]"
                          : "bg-[var(--color-surface-sunk)] border border-[var(--color-border-strong)]",
                      )}
                    >
                      <span
                        className={clsx(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                          rule.enabled ? "left-[1.15rem]" : "left-0.5",
                        )}
                      />
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-full bg-[var(--color-surface-sunk)] px-2.5 py-1 text-[0.66rem] text-[var(--color-text-disabled)]">
                      not measurable
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function Unavailable({
  label,
  reason,
  phase,
}: {
  label: string;
  reason: string;
  phase: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] px-3.5 py-3">
      <Info size={15} className="mt-0.5 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[0.78rem] font-medium text-[var(--color-text-primary)]">{label}</p>
        <p className="mt-0.5 text-[0.72rem] text-[var(--color-text-secondary)]">{reason}</p>
      </div>
      <span className="shrink-0 rounded-full bg-[var(--color-accent-wash)] px-2.5 py-1 text-[0.66rem] font-medium text-[var(--color-accent)]">
        {phase}
      </span>
    </div>
  );
}

function AlertCard({
  group,
  open,
  onToggle,
}: {
  group: AlertGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const severity = SEVERITY[group.severity];
  const truncated = group.count > group.rows.length;

  return (
    <div className="glass-solid overflow-hidden rounded-[var(--radius)] shadow-[var(--shadow-card)]">
      {/* Severity is carried by the count badge below, which is already
          washed and coloured by band. A second indicator on the card edge
          would be redundant. */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--color-accent-wash)]"
      >
        <span
          className={clsx(
            "data flex h-10 min-w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] px-2 text-[1rem] font-bold",
            severity.wash,
            severity.text,
          )}
        >
          {group.count}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.92rem] font-semibold text-[var(--color-text-primary)]">
            {group.label}
          </span>
          <span className="block truncate text-[0.74rem] text-[var(--color-text-secondary)]">
            {group.description}
          </span>
        </span>

        <ChevronDown
          size={16}
          aria-hidden
          className={clsx(
            "shrink-0 text-[var(--color-text-secondary)] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <p
              className={clsx(
                "mx-4 mb-3 rounded-[var(--radius-sm)] px-3 py-2 text-[0.76rem] font-medium",
                severity.wash,
                severity.text,
              )}
            >
              {group.action}
            </p>

            <div className="max-h-[42vh] overflow-auto border-t border-[var(--color-border)]">
              <table className="w-full border-separate border-spacing-0 text-left">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {["Container", "LFD", "Days", "Appointment", "Trucker"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunk)] px-3 py-2 text-[0.64rem] font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, index) => (
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
                          className="data text-[0.78rem] font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                        >
                          {formatContainerNumber(row.containerNumber)}
                        </Link>
                      </td>
                      <td className="data border-b border-[var(--color-border)] px-3 py-2 text-[0.76rem] text-[var(--color-text-secondary)]">
                        {formatDateShort(row.lastFreeDay)}
                      </td>
                      <td
                        className={clsx(
                          "data border-b border-[var(--color-border)] px-3 py-2 text-[0.76rem] font-medium",
                          row.daysRemaining === null
                            ? "text-[var(--color-text-disabled)]"
                            : row.daysRemaining < 0
                              ? "text-[var(--color-danger)]"
                              : row.daysRemaining <= 2
                                ? "text-[var(--color-warning)]"
                                : "text-[var(--color-text-secondary)]",
                        )}
                      >
                        {row.daysRemaining === null
                          ? "—"
                          : row.daysRemaining < 0
                            ? `${Math.abs(row.daysRemaining)} over`
                            : `${row.daysRemaining}`}
                      </td>
                      <td className="data border-b border-[var(--color-border)] px-3 py-2 text-[0.76rem] text-[var(--color-text-secondary)]">
                        {row.appointmentDate ? formatDateShort(row.appointmentDate) : "—"}
                      </td>
                      <td className="max-w-[170px] truncate border-b border-[var(--color-border)] px-3 py-2 text-[0.76rem] text-[var(--color-text-secondary)]">
                        {row.trucker ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {truncated && (
              <p className="border-t border-[var(--color-border)] px-4 py-2.5 text-[0.72rem] text-[var(--color-text-secondary)]">
                Showing the {group.rows.length} most urgent of {group.count}.{" "}
                <Link to="/containers" className="font-medium text-[var(--color-primary)] hover:underline">
                  Open Container Search
                </Link>{" "}
                for the full list.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AlertsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="shimmer h-12 w-72 rounded-[var(--radius-sm)]" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="shimmer h-[72px] rounded-[var(--radius)]" />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="shimmer h-[68px] rounded-[var(--radius)]" />
      ))}
    </div>
  );
}

function AlertsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-danger-wash)] text-[var(--color-danger)]">
        <AlertTriangle size={24} aria-hidden />
      </span>
      <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
        Could not load alerts
      </p>
      <p className="max-w-md text-[var(--text-body)] text-[var(--color-text-secondary)]">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
      >
        Retry
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import clsx from "clsx";
import { api, type AlertSummary } from "../services/api";

/**
 * Notifications (doc 03 §Dashboard).
 *
 * Surfaces what the alert engine already found, rather than inventing a
 * second notion of "important". The count badge shows CRITICAL only: a badge
 * that includes every warning reads as 65 and gets ignored within a day.
 */
const REFRESH_MS = 60_000;

export function NotificationBell() {
  const [alerts, setAlerts] = useState<AlertSummary | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .getAlerts()
        .then((result) => live && setAlerts(result))
        .catch(() => undefined);

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const critical = alerts?.totals.critical ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${critical > 0 ? `, ${critical} critical` : ""}`}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunk)] hover:text-[var(--color-text-primary)]"
      >
        <Bell size={17} aria-hidden />
        {critical > 0 && (
          <span className="data absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[0.58rem] font-bold text-white">
            {critical > 99 ? "99+" : critical}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="glass-solid absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-[var(--radius)] shadow-[var(--shadow-modal)]"
          >
            <div className="border-b border-[var(--color-border)] px-4 py-2.5">
              <p className="text-[0.82rem] font-semibold text-[var(--color-text-primary)]">
                Notifications
              </p>
              <p className="text-[0.68rem] text-[var(--color-text-secondary)]">
                From the alert rules, refreshed every minute
              </p>
            </div>

            {!alerts ? (
              <div className="p-3">
                <div className="shimmer h-12 rounded-[var(--radius-sm)]" />
              </div>
            ) : alerts.groups.length === 0 ? (
              <p className="px-4 py-6 text-center text-[0.78rem] text-[var(--color-text-secondary)]">
                Nothing needs attention.
              </p>
            ) : (
              <ul className="max-h-72 overflow-auto">
                {alerts.groups.map((group) => (
                  <li key={group.id}>
                    <Link
                      to="/alerts"
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-[var(--color-accent-wash)]"
                    >
                      <span
                        className={clsx(
                          "mt-1 h-2 w-2 shrink-0 rounded-full",
                          group.severity === "critical"
                            ? "bg-[var(--color-danger)]"
                            : group.severity === "warning"
                              ? "bg-[var(--color-warning)]"
                              : "bg-[var(--color-primary)]",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.78rem] text-[var(--color-text-primary)]">
                          {group.label}
                        </span>
                        <span className="block truncate text-[0.68rem] text-[var(--color-text-secondary)]">
                          {group.action}
                        </span>
                      </span>
                      <span className="data shrink-0 text-[0.8rem] font-semibold text-[var(--color-text-primary)]">
                        {group.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {/* Say when rules are switched off. A quiet board that is quiet
                because somebody disabled a rule is the worst kind of quiet. */}
            {alerts && alerts.disabledRules.length > 0 && (
              <p className="border-t border-[var(--color-border)] px-4 py-2 text-[0.66rem] text-[var(--color-warning)]">
                {alerts.disabledRules.length} rule
                {alerts.disabledRules.length === 1 ? " is" : "s are"} switched off:{" "}
                {alerts.disabledRules.join(", ")}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

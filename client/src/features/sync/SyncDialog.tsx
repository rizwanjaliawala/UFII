import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Database, RefreshCw, X } from "lucide-react";
import { formatRelative } from "@tms/shared";
import { api, type IngestRunResult, type SyncRun } from "../../services/api";

/**
 * Run a sync (doc 03 §Synchronization).
 *
 * The header's Refresh button used to call `/containers/refresh`, which on
 * the Neon path re-read the same rows and changed nothing — so the data age
 * never moved and the button looked broken. Newer data only arrives by
 * running the ingest, which reads the source sheets and writes to Neon.
 *
 * That is a write, so it is gated by the edit key, and it takes 16–35s, so
 * the dialog stays open and reports what happened rather than spinning
 * silently.
 */
function Row({ label, value }: { label: string; value: number | undefined }) {
  return (
    <>
      <dt className="text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="data text-right font-medium">
        {value === undefined ? "—" : value.toLocaleString("en-US")}
      </dd>
    </>
  );
}

export function SyncDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [editKey, setEditKey] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<IngestRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<SyncRun | null>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    api
      .getSyncRuns()
      .then((r) => setLastRun(r.runs[0] ?? null))
      .catch(() => setLastRun(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Not while a sync is in flight: closing mid-run would leave the
      // operator with no idea whether it finished.
      if (event.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, running, onClose]);

  const run = async () => {
    if (!editKey) {
      setError("The edit key is required — a sync writes to the database.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.runIngest(editKey));
      api.getSyncRuns().then((r) => setLastRun(r.runs[0] ?? null)).catch(() => undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm"
          onClick={() => !running && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Synchronize data"
            className="glass-solid w-full max-w-md overflow-hidden rounded-[var(--radius)] shadow-[var(--shadow-modal)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3.5">
              <div>
                <h2 className="flex items-center gap-2 text-[0.98rem] font-semibold text-[var(--color-text-primary)]">
                  <Database size={16} className="text-[var(--color-primary)]" aria-hidden />
                  Synchronize data
                </h2>
                <p className="mt-0.5 text-[0.74rem] text-[var(--color-text-secondary)]">
                  Reads the source sheets and updates the database.
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={running}
                aria-label="Close"
                className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:opacity-40"
              >
                <X size={17} aria-hidden />
              </button>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              {lastRun && (
                <p className="text-[0.76rem] text-[var(--color-text-secondary)]">
                  Last sync {formatRelative(lastRun.started_at)} ·{" "}
                  <span className="text-[var(--color-text-primary)]">
                    {lastRun.containers_upserted.toLocaleString("en-US")} containers
                  </span>{" "}
                  · {lastRun.status}
                </p>
              )}

              <p className="rounded-[var(--radius-sm)] bg-[var(--color-surface-sunk)] px-3 py-2 text-[0.74rem] text-[var(--color-text-secondary)]">
                This takes 16–35 seconds. The source sheets are only ever read —
                the application never writes to them.
              </p>

              <div className="flex items-center gap-2">
                <label htmlFor="sync-edit-key" className="text-[0.8rem] text-[var(--color-text-primary)]">
                  Edit key
                </label>
                <input
                  id="sync-edit-key"
                  type="password"
                  inputMode="numeric"
                  value={editKey}
                  onChange={(event) => setEditKey(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && !running && run()}
                  placeholder="••••"
                  disabled={running}
                  className="w-24 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-center text-[0.85rem] tracking-[0.3em] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] disabled:opacity-60"
                />
              </div>

              {error && (
                <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-danger-wash)] px-3 py-2 text-[0.76rem] text-[var(--color-danger)]">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  {error}
                </p>
              )}

              {result && !result.error && (
                <div className="rounded-[var(--radius-sm)] bg-[var(--color-success-wash)] px-3 py-2.5 text-[0.76rem] text-[var(--color-text-primary)]">
                  <p className="flex items-center gap-2 font-medium text-[var(--color-success)]">
                    <Check size={14} aria-hidden />
                    Sync complete
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.74rem]">
                    <Row label="Source rows processed" value={result.rowsRead} />
                    <Row label="New containers" value={result.containersInserted} />
                    <Row label="Existing updated" value={result.containersUpdated} />
                    <Row label="Invoices" value={result.invoicesUpserted} />
                  </dl>
                  {/* The total is the point of a cumulative store, so it is
                      stated last and on its own line rather than buried. */}
                  <p className="mt-2 border-t border-[var(--color-success)]/25 pt-2 text-[0.74rem]">
                    <span className="text-[var(--color-text-secondary)]">
                      Total stored in the database
                    </span>{" "}
                    <span className="data font-semibold">
                      {result.containersTotal?.toLocaleString("en-US")}
                    </span>
                  </p>
                  <p className="mt-1 text-[0.7rem] text-[var(--color-text-disabled)]">
                    Nothing is ever deleted — containers no longer in the sheets
                    are retained. Reload to see the updated figures.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
              <button
                onClick={onClose}
                disabled={running}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-[0.8rem] text-[var(--color-text-primary)] disabled:opacity-40"
              >
                Close
              </button>
              <button
                onClick={run}
                disabled={running || !editKey}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-1.5 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                <RefreshCw size={14} className={running ? "animate-spin" : undefined} aria-hidden />
                {running ? "Syncing…" : "Run sync"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

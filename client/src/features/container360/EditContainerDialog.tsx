import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, Loader2, Lock, X } from "lucide-react";
import clsx from "clsx";
import { CONTAINER_STATUSES, formatContainerNumber, type Container } from "@tms/shared";
import { api, ApiError } from "../../services/api";

/**
 * Container edit dialog.
 *
 * Only user-owned fields are offered. Operational values (LFD, gate dates,
 * terminal, SSL) come from the read-only source sheets and are deliberately
 * absent — offering an edit the next ingest would silently revert is worse
 * than not offering it at all.
 *
 * The edit key is collected here but validated ON THE SERVER. It is held in
 * component state for the duration of the dialog and never persisted to
 * localStorage, so it cannot leak from a shared machine.
 */

const EDITABLE_STATUSES = CONTAINER_STATUSES;

export function EditContainerDialog({
  container,
  open,
  onClose,
  onSaved,
}: {
  container: Container;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Container) => void;
}) {
  const [status, setStatus] = useState(container.status);
  const [pickupNumber, setPickupNumber] = useState(container.pickupNumber ?? "");
  const [dispatchNotes, setDispatchNotes] = useState(container.dispatchNotes ?? "");
  const [internalNotes, setInternalNotes] = useState(container.internalNotes ?? "");
  const [priority, setPriority] = useState(container.priority ?? "");
  const [reason, setReason] = useState("");

  const [editKey, setEditKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keyInputRef = useRef<HTMLInputElement>(null);

  // Reset when reopened so a previous attempt's key never lingers.
  useEffect(() => {
    if (!open) return;
    setStatus(container.status);
    setPickupNumber(container.pickupNumber ?? "");
    setDispatchNotes(container.dispatchNotes ?? "");
    setInternalNotes(container.internalNotes ?? "");
    setPriority(container.priority ?? "");
    setReason("");
    setEditKey("");
    setError(null);
  }, [open, container]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving]);

  const changed =
    status !== container.status ||
    pickupNumber !== (container.pickupNumber ?? "") ||
    dispatchNotes !== (container.dispatchNotes ?? "") ||
    internalNotes !== (container.internalNotes ?? "") ||
    priority !== (container.priority ?? "");

  const handleSave = async () => {
    if (!changed || editKey.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      const result = await api.editContainer(
        container.containerNumber,
        {
          ...(status !== container.status ? { status } : {}),
          ...(pickupNumber !== (container.pickupNumber ?? "")
            ? { pickupNumber: pickupNumber || null }
            : {}),
          ...(dispatchNotes !== (container.dispatchNotes ?? "")
            ? { dispatchNotes: dispatchNotes || null }
            : {}),
          ...(internalNotes !== (container.internalNotes ?? "")
            ? { internalNotes: internalNotes || null }
            : {}),
          ...(priority !== (container.priority ?? "")
            ? { priority: (priority || null) as Container["priority"] }
            : {}),
          ...(reason ? { reason } : {}),
        },
        editKey,
      );

      onSaved(result.container);
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not save. Please retry.";
      setError(message);
      // A rejected key is the likely failure, so put the cursor back there.
      if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
        setEditKey("");
        keyInputRef.current?.focus();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => !saving && onClose()}
            className="fixed inset-0 z-[60] bg-[var(--color-text-primary)]/35 backdrop-blur-[3px]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={`Edit container ${container.containerNumber}`}
            className="glass-solid fixed top-1/2 left-1/2 z-[61] flex max-h-[88vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius-lg)] shadow-[var(--shadow-elevated)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <h2 className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
                  Edit container
                </h2>
                <p className="data mt-0.5 text-[0.8rem] text-[var(--color-text-secondary)]">
                  {formatContainerNumber(container.containerNumber)}
                </p>
              </div>
              <button
                onClick={() => !saving && onClose()}
                aria-label="Close"
                className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunk)]"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-4">
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Container["status"])}
                    className={inputClass}
                  >
                    {EDITABLE_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Pickup number (PU)"
                  hint="Not present in the source sheet — set here or via OCR."
                >
                  <input
                    value={pickupNumber}
                    onChange={(e) => setPickupNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. PU483920"
                    className={clsx(inputClass, "data")}
                  />
                </Field>

                <Field label="Priority">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Not set</option>
                    {["Low", "Normal", "High", "Critical"].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Dispatch notes">
                  <textarea
                    value={dispatchNotes}
                    onChange={(e) => setDispatchNotes(e.target.value)}
                    rows={2}
                    className={clsx(inputClass, "resize-y")}
                  />
                </Field>

                <Field label="Internal notes">
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    rows={2}
                    className={clsx(inputClass, "resize-y")}
                  />
                </Field>

                <Field label="Reason for change" hint="Recorded in the audit trail.">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Vendor confirmed POD"
                    className={inputClass}
                  />
                </Field>

                {/* ---- Edit key ---- */}
                <div className="rounded-[var(--radius-sm)] border border-[var(--color-accent)]/30 bg-[var(--color-accent-wash)] p-3.5">
                  <label
                    htmlFor="edit-key"
                    className="flex items-center gap-2 text-[0.8rem] font-semibold text-[var(--color-text-primary)]"
                  >
                    <KeyRound size={14} className="text-[var(--color-accent)]" aria-hidden />
                    Edit key required
                  </label>
                  <p className="mt-1 text-[0.72rem] text-[var(--color-text-secondary)]">
                    Changes are recorded against this container's history.
                  </p>
                  <input
                    id="edit-key"
                    ref={keyInputRef}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={editKey}
                    onChange={(e) => setEditKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    placeholder="••••"
                    className={clsx(inputClass, "data mt-2.5 tracking-[0.3em]")}
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-danger-wash)] px-3 py-2 text-[0.78rem] text-[var(--color-danger)]"
                  >
                    <Lock size={13} aria-hidden />
                    {error}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3.5">
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[0.8rem] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-sunk)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !changed || editKey.length === 0}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const inputClass =
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[0.82rem] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.72rem] font-medium tracking-wide text-[var(--color-text-secondary)] uppercase">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[0.68rem] text-[var(--color-text-disabled)]">{hint}</span>
      )}
    </div>
  );
}

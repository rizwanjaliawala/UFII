import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Boxes,
  Calendar,
  FileText,
  Mail,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import clsx from "clsx";
import {
  CONTAINER_LIFECYCLE,
  formatContainerNumber,
  freeTimeLabel,
  lfdRisk,
  formatDateShort,
  type Container,
  type LfdRisk,
} from "@tms/shared";
import { api } from "../../services/api";
import { Container360Timeline } from "./Container360Timeline";
import { EditContainerDialog } from "./EditContainerDialog";

/**
 * Container 360 (doc 04).
 *
 * One container, one surface: status, timeline, operational record, related
 * containers and the sections that arrive with Outlook and Cost in later
 * phases. Opens as a right-hand drawer over Container Search and is
 * deep-linkable at /containers/:containerNumber.
 */

const RISK_BANNER: Record<
  LfdRisk,
  { bg: string; text: string; label: string; icon: boolean }
> = {
  overdue: {
    bg: "bg-[var(--color-danger-wash)]",
    text: "text-[var(--color-danger)]",
    label: "Past Last Free Day",
    icon: true,
  },
  critical: {
    bg: "bg-[var(--color-danger-wash)]",
    text: "text-[var(--color-danger)]",
    label: "Last Free Day is today",
    icon: true,
  },
  warning: {
    bg: "bg-[var(--color-warning-wash)]",
    text: "text-[var(--color-warning)]",
    label: "Last Free Day approaching",
    icon: true,
  },
  safe: {
    bg: "bg-[var(--color-success-wash)]",
    text: "text-[var(--color-success)]",
    label: "Within free time",
    icon: false,
  },
  cleared: {
    bg: "bg-[var(--color-surface-sunk)]",
    text: "text-[var(--color-text-secondary)]",
    label: "Cleared — demurrage no longer accruing",
    icon: false,
  },
};

export function Container360Drawer({
  containerNumber,
  onClose,
}: {
  containerNumber: string | null;
  onClose: () => void;
}) {
  const [container, setContainer] = useState<Container | null>(null);
  const [related, setRelated] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!containerNumber) {
      setContainer(null);
      return;
    }
    setLoading(true);
    setError(null);

    let cancelled = false;
    api
      .getContainer(containerNumber)
      .then((result) => {
        if (cancelled) return;
        setContainer(result.container);
        setRelated(result.related);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [containerNumber]);

  // Esc closes from anywhere — operators live on the keyboard.
  useEffect(() => {
    if (!containerNumber) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [containerNumber, onClose]);

  const risk = container ? lfdRisk(container) : "safe";
  const banner = RISK_BANNER[risk];

  return (
    <AnimatePresence>
      {containerNumber && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[var(--color-text-primary)]/20 backdrop-blur-[2px]"
          />

          <motion.aside
            initial={{ x: 32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="glass-solid fixed top-0 right-0 z-50 flex h-full w-full max-w-[560px] flex-col border-y-0 border-r-0 shadow-[var(--shadow-drawer)]"
            role="dialog"
            aria-modal="true"
            aria-label={`Container ${containerNumber}`}
          >
            {/* ---- Header ---- */}
            <div className="border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.66rem] font-semibold tracking-[0.16em] text-[var(--color-text-secondary)] uppercase">
                    Container 360
                  </p>
                  <h2 className="data mt-1 text-[1.35rem] font-bold text-[var(--color-text-primary)]">
                    {formatContainerNumber(containerNumber)}
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {container && (
                    <button
                      onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-2.5 py-1.5 text-[0.76rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
                    >
                      <Pencil size={13} aria-hidden />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    aria-label="Close container detail"
                    className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunk)] hover:text-[var(--color-text-primary)]"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {container && (
                <div
                  className={clsx(
                    "mt-3 flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2",
                    banner.bg,
                  )}
                >
                  {banner.icon && (
                    <AlertTriangle size={14} className={banner.text} aria-hidden />
                  )}
                  <span className={clsx("text-[0.78rem] font-medium", banner.text)}>
                    {banner.label}
                  </span>
                  <span
                    className={clsx("data ml-auto text-[0.8rem] font-semibold", banner.text)}
                  >
                    {freeTimeLabel(container)}
                  </span>
                </div>
              )}
            </div>

            {/* ---- Body ---- */}
            <div className="flex-1 overflow-y-auto">
              {loading && !container ? (
                <div className="flex flex-col gap-3 p-5">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="shimmer h-14 rounded-[var(--radius-sm)]" />
                  ))}
                </div>
              ) : error ? (
                <div className="p-5">
                  <p className="text-[0.85rem] text-[var(--color-danger)]">{error}</p>
                </div>
              ) : container ? (
                <>
                  <Section title="Lifecycle">
                    <Container360Timeline container={container} />
                  </Section>

                  <Section title="Operational Record">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <Field label="Status" value={container.status} />
                      <Field label="Appointment status" value={container.appointmentStatus} />
                      <Field label="Last Free Day" value={formatDateShort(container.lastFreeDay)} mono />
                      <Field label="Appointment" value={formatDateShort(container.appointmentDate)} mono />
                      <Field label="Vessel ETA" value={formatDateShort(container.eta)} mono />
                      <Field label="Out gated" value={formatDateShort(container.gateOutDate)} mono />
                      <Field label="Empty return" value={formatDateShort(container.emptyReturnDate)} mono />
                      <Field label="POD" value={container.pod} />
                      <Field label="Terminal" value={container.terminal} />
                      <Field label="SSL" value={container.ssl} />
                      <Field label="MBL #" value={container.blNumber} mono />
                      <Field label="ISA #" value={container.isa} mono />
                      <Field label="FC" value={container.fc} mono />
                      <Field label="Trucker" value={container.trucker} />
                      <Field label="Delivered through" value={container.deliveredThrough} />
                      <Field label="Stakeholder" value={container.responsibleStakeholder} />
                      {container.vesselName && (
                        <Field label="Vessel" value={container.vesselName} />
                      )}
                      {container.rejectionReason && (
                        <Field label="Rejection reason" value={container.rejectionReason} />
                      )}
                    </dl>
                  </Section>

                  <Section title="Pickup Number">
                    <PendingNotice
                      icon={Boxes}
                      message="Source Sheet 1 carries no PU column — pickup numbers arrive only from Outlook screenshots via OCR."
                      phase="Phase 3"
                    />
                  </Section>

                  <Section title="Email Intelligence">
                    <PendingNotice
                      icon={Mail}
                      message="Conversation history and AI summaries for this container."
                      phase="Phase 3"
                    />
                  </Section>

                  <Section title="Invoices & Cost">
                    <PendingNotice
                      icon={FileText}
                      message="Linked D&D invoices, estimated versus actual cost and variance."
                      phase="Phase 4"
                    />
                  </Section>

                  <Section title="AI Insights">
                    <PendingNotice
                      icon={Sparkles}
                      message="Health score, risk assessment and recommended next action."
                      phase="Phase 4"
                    />
                  </Section>

                  {related.length > 0 && (
                    <Section title={`Related Containers (${related.length})`}>
                      <ul className="flex flex-col gap-1">
                        {related.map((item) => (
                          <li
                            key={item.containerNumber}
                            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5"
                          >
                            <span className="data text-[0.76rem] text-[var(--color-text-primary)]">
                              {formatContainerNumber(item.containerNumber)}
                            </span>
                            <span className="ml-auto text-[0.7rem] text-[var(--color-text-secondary)]">
                              {item.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  <Section title="Provenance">
                    <p className="flex items-center gap-2 text-[0.74rem] text-[var(--color-text-secondary)]">
                      <Calendar size={13} aria-hidden />
                      Read from {container.sourceSheet}
                      {container.sourceTab ? ` · ${container.sourceTab}` : ""}
                    </p>
                  </Section>
                </>
              ) : null}
            </div>
          </motion.aside>

          {container && (
            <EditContainerDialog
              container={container}
              open={editing}
              onClose={() => setEditing(false)}
              onSaved={(updated) => setContainer(updated)}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------------- Building blocks ---------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--color-border)] px-5 py-4">
      <h3 className="mb-3 text-[0.68rem] font-semibold tracking-[0.16em] text-[var(--color-text-secondary)] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[0.62rem] tracking-wider text-[var(--color-text-secondary)] uppercase">
        {label}
      </dt>
      <dd
        className={clsx(
          "truncate text-[0.8rem] text-[var(--color-text-primary)]",
          mono && "data",
          !value && "text-[var(--color-text-disabled)]",
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

/**
 * Honest placeholder for a section whose data source is not yet connected.
 * States the reason rather than showing an empty shell that implies the
 * feature exists (doc 02 §Empty States).
 */
function PendingNotice({
  icon: Icon,
  message,
  phase,
}: {
  icon: typeof Mail;
  message: string;
  phase: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-3">
      <Icon size={15} className="mt-0.5 shrink-0 text-[var(--color-text-disabled)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-[0.76rem] text-[var(--color-text-secondary)]">{message}</p>
        <p className="mt-1 text-[0.68rem] font-medium text-[var(--color-accent)]">{phase}</p>
      </div>
    </div>
  );
}

export { CONTAINER_LIFECYCLE };

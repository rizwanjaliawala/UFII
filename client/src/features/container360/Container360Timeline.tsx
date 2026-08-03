import { motion } from "framer-motion";
import { Check } from "lucide-react";
import clsx from "clsx";
import { formatDateShort, type Container } from "@tms/shared";

/**
 * Container lifecycle timeline (doc 04 §Timeline).
 *
 * Milestones are derived from dates that actually exist on the record, so a
 * step is "reached" only when there is a date behind it. Nothing is inferred
 * from status alone — a green tick here means the sheet recorded the event.
 *
 * The Last Free Day is rendered as a deadline marker rather than a milestone:
 * it is a constraint the container moves against, not something it achieves.
 */

interface Milestone {
  key: string;
  label: string;
  date: string | null;
  deadline?: boolean;
}

export function Container360Timeline({ container }: { container: Container }) {
  const milestones: Milestone[] = [
    { key: "eta", label: "Vessel ETA", date: container.eta },
    { key: "lfd", label: "Last Free Day", date: container.lastFreeDay, deadline: true },
    { key: "appointment", label: "Appointment", date: container.appointmentDate },
    { key: "gateOut", label: "Out gated", date: container.gateOutDate },
    { key: "emptyReturn", label: "Empty returned", date: container.emptyReturnDate },
  ];

  return (
    <ol className="flex flex-col gap-0">
      {milestones.map((milestone, index) => {
        const reached = milestone.date !== null;
        const isLast = index === milestones.length - 1;

        return (
          <li key={milestone.key} className="flex gap-3">
            {/* Rail */}
            <div className="flex flex-col items-center">
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.24, delay: index * 0.05 }}
                className={clsx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                  milestone.deadline
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-wash)]"
                    : reached
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                      : "border-[var(--color-border-strong)] bg-[var(--color-surface)]",
                )}
              >
                {reached && !milestone.deadline && (
                  <Check size={12} className="text-white" aria-hidden />
                )}
                {milestone.deadline && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                )}
              </motion.span>

              {!isLast && (
                <span
                  className={clsx(
                    "w-0.5 flex-1",
                    reached
                      ? "bg-[var(--color-primary)]/40"
                      : "bg-[var(--color-border-strong)]",
                  )}
                />
              )}
            </div>

            {/* Label */}
            <div className={clsx("min-w-0 flex-1", isLast ? "pb-0" : "pb-4")}>
              <p
                className={clsx(
                  "text-[0.8rem] font-medium",
                  reached
                    ? "text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-disabled)]",
                )}
              >
                {milestone.label}
              </p>
              <p
                className={clsx(
                  "data text-[0.74rem]",
                  milestone.deadline
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text-secondary)]",
                )}
              >
                {milestone.date ? formatDateShort(milestone.date) : "Not recorded"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

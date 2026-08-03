import { motion } from "framer-motion";
import { AlertTriangle, Check, Loader2, Minus, X } from "lucide-react";
import clsx from "clsx";
import {
  HEALTH_SERVICES,
  type HealthService,
  type ServiceStatus,
} from "../../services/initialization";

/**
 * Live system status panel (doc 02 §Startup Health Check).
 *
 * Each of the eleven services shows Waiting / Connecting / Ready / Warning /
 * Failed with its own icon and colour. This is what makes the startup screen
 * functional rather than decorative — a degraded integration is stated plainly
 * here instead of being animated past.
 */

const STATUS_STYLE: Record<
  ServiceStatus,
  { icon: typeof Check; className: string; label: string }
> = {
  Waiting: {
    icon: Minus,
    className: "text-[var(--color-text-disabled)]",
    label: "Waiting",
  },
  Connecting: {
    icon: Loader2,
    className: "text-[var(--color-accent)]",
    label: "Connecting",
  },
  Ready: { icon: Check, className: "text-[var(--color-success)]", label: "Ready" },
  Warning: {
    icon: AlertTriangle,
    className: "text-[var(--color-warning)]",
    label: "Warning",
  },
  Failed: { icon: X, className: "text-[var(--color-danger)]", label: "Failed" },
};

export function HealthPanel({
  services,
  details,
}: {
  services: Record<HealthService, ServiceStatus>;
  details: Partial<Record<HealthService, string>>;
}) {
  return (
    <div
      className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)]/70 p-4"
      role="status"
      aria-live="polite"
      aria-label="System status"
    >
      <p className="mb-3 text-[0.68rem] font-semibold tracking-[0.18em] text-[var(--color-text-secondary)] uppercase">
        System Status
      </p>

      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {HEALTH_SERVICES.map((service, i) => {
          const status = services[service];
          const style = STATUS_STYLE[status];
          const Icon = style.icon;
          const detail = details[service];

          return (
            <motion.li
              key={service}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.24, delay: 0.05 + i * 0.025 }}
              className="flex items-center gap-2.5 text-[0.78rem]"
            >
              <Icon
                size={14}
                className={clsx(
                  "shrink-0",
                  style.className,
                  status === "Connecting" && "animate-spin",
                )}
                aria-hidden
              />
              <span
                className={clsx(
                  "truncate",
                  status === "Waiting"
                    ? "text-[var(--color-text-disabled)]"
                    : "text-[var(--color-text-primary)]",
                )}
              >
                {service}
              </span>
              <span className="sr-only">{style.label}</span>

              {detail && status !== "Ready" && (
                <span
                  className={clsx("ml-auto truncate text-[0.66rem]", style.className)}
                  title={detail}
                >
                  {detail}
                </span>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

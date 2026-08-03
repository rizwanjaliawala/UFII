import { motion } from "framer-motion";
import type { ComponentType } from "react";

/**
 * Interim state for modules scheduled in later phases.
 *
 * Doc 02 forbids blank pages — every screen states what it is, why it is empty
 * and what happens next. This is deliberately explicit about not being built
 * yet rather than showing a hollow layout that implies working software.
 */
export function ModulePlaceholder({
  title,
  description,
  phase,
  icon: Icon,
  capabilities,
}: {
  title: string;
  description: string;
  phase: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  capabilities: string[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[var(--text-page-title)] font-bold text-[var(--color-text-primary)]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--text-body-lg)] text-[var(--color-text-secondary)]">
          {description}
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="card flex flex-col items-center gap-5 px-6 py-12 text-center"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-wash)] text-[var(--color-primary)]">
          <Icon size={24} />
        </span>

        <div>
          <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
            Scheduled for {phase}
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[var(--text-body)] text-[var(--color-text-secondary)]">
            The data layer and synchronization engine are being built first, so
            every module reads verified data from TMS Master rather than a mock.
          </p>
        </div>

        <ul className="flex flex-wrap justify-center gap-2">
          {capabilities.map((capability) => (
            <li
              key={capability}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[var(--text-caption)] text-[var(--color-text-secondary)]"
            >
              {capability}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}

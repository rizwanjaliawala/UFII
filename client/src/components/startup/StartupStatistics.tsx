import { motion } from "framer-motion";
import type { StartupStatistics as Stats } from "../../services/initialization";

/**
 * Live startup counters (doc 02 §Startup Statistics).
 *
 * These are real record counts reported by the backend as each stage lands,
 * not animated placeholders. A tile stays dim at zero rather than implying
 * data that has not loaded.
 */

const TILES: { key: keyof Stats; label: string }[] = [
  { key: "containersLoaded", label: "Containers" },
  { key: "invoicesLoaded", label: "Invoices" },
  { key: "emailsIndexed", label: "Emails" },
  { key: "documentsLinked", label: "Documents" },
  { key: "vendorsLoaded", label: "Vendors" },
  { key: "agentsStarted", label: "AI Agents" },
];

export function StartupStatistics({ stats }: { stats: Stats }) {
  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {TILES.map(({ key, label }, i) => {
        const value = stats[key];
        const loaded = value > 0;

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: i * 0.04 }}
            className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-2.5 py-2 text-center"
          >
            <dd
              className={
                loaded
                  ? "data text-[1.05rem] leading-none font-semibold text-[var(--color-primary)]"
                  : "data text-[1.05rem] leading-none font-semibold text-[var(--color-text-disabled)]"
              }
            >
              {/* Keyed on the value so a changing count cross-fades in place */}
              <motion.span
                key={value}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {value.toLocaleString("en-US")}
              </motion.span>
            </dd>
            <dt className="mt-1 text-[0.58rem] tracking-wider text-[var(--color-text-secondary)] uppercase">
              {label}
            </dt>
          </motion.div>
        );
      })}
    </dl>
  );
}

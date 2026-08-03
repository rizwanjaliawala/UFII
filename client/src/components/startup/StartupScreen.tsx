import { motion } from "framer-motion";
import { AlertOctagon, RefreshCw, WifiOff } from "lucide-react";
import { APP_VERSION } from "@tms/shared";
import type { InitController } from "../../hooks/useInitialization";
import { PhotoBackdrop } from "./PhotoBackdrop";
import { BrandLogo } from "./BrandLogo";
import { HealthPanel } from "./HealthPanel";
import { StartupStatistics } from "./StartupStatistics";

/**
 * System Initialization Dashboard (doc 02 §Welcome & Enterprise Startup
 * Experience).
 *
 * Not a decorative splash. Every element reflects real state: the progress bar
 * tracks completed pipeline stages, the health panel reports genuine service
 * checks, and the statistics count records actually loaded.
 *
 * Elements appear in the documented sequence:
 *   Logo → Company Name → System Name → Status Panel → Progress → Messages
 */

/** Sequential reveal — one shared rhythm so the cascade reads as intentional. */
const reveal = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.42, delay, ease: [0.4, 0, 0.2, 1] as const },
});

export function StartupScreen({
  state,
  onContinueOffline,
}: {
  state: InitController;
  onContinueOffline: () => void;
}) {
  const failed = state.phase === "failed";

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--color-background)]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      role="dialog"
      aria-modal="true"
      aria-label="Initializing Utopia Transportation Management System"
    >
      <PhotoBackdrop />

      <div className="relative flex flex-1 items-center justify-center px-6 py-10">
        {/* The whole panel is one glass sheet, so the blur is composited once
            rather than per element. */}
        <motion.div
          {...reveal(0.34)}
          className="glass glass-edge w-full max-w-[660px] rounded-[var(--radius-lg)] p-8 shadow-[var(--shadow-elevated)]"
        >
          {/* ---- Logo ---- */}
          <motion.div
            {...reveal(0)}
            className="flex justify-center text-[var(--color-primary)]"
          >
            <BrandLogo size={60} animated />
          </motion.div>

          {/* ---- Company name ---- */}
          <motion.h1
            {...reveal(0.5)}
            className="mt-5 text-center text-[1.7rem] leading-tight font-bold tracking-tight text-[var(--color-text-primary)]"
          >
            Utopia Fulfillment Inc.
          </motion.h1>

          {/* ---- System name ---- */}
          <motion.div {...reveal(0.62)} className="mt-2 text-center">
            <p className="text-[0.95rem] font-medium text-[var(--color-text-secondary)]">
              Transportation Management System
            </p>
            <p className="mt-2 text-[0.68rem] font-semibold tracking-[0.28em] text-[var(--color-accent)] uppercase">
              Enterprise Edition
            </p>
          </motion.div>

          {failed ? (
            <StartupFailure state={state} onContinueOffline={onContinueOffline} />
          ) : (
            <>
              {/* ---- Status panel ---- */}
              <motion.div {...reveal(0.78)} className="mt-7">
                <HealthPanel services={state.services} details={state.serviceDetails} />
              </motion.div>

              {/* ---- Progress ---- */}
              <motion.div {...reveal(0.9)} className="mt-6">
                <ProgressBar progress={state.progress} />

                <div className="mt-3 flex items-baseline justify-between gap-4">
                  {/* Keyed so each stage cross-fades rather than snapping —
                      the text changes often during startup. */}
                  <motion.p
                    key={state.currentMessage}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className="text-[0.82rem] text-[var(--color-text-secondary)]"
                    aria-live="polite"
                  >
                    {state.currentMessage}
                  </motion.p>
                  <span className="data shrink-0 text-[0.75rem] font-medium text-[var(--color-text-secondary)]">
                    {Math.round(state.progress * 100)}%
                  </span>
                </div>
              </motion.div>

              {/* ---- Live statistics ---- */}
              <motion.div {...reveal(1.02)} className="mt-6">
                <StartupStatistics stats={state.statistics} />
              </motion.div>

              {/* ---- Offline notice ---- */}
              {state.degraded && state.phase === "ready" && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 flex items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-warning-wash)] px-3 py-2 text-[0.76rem] text-[var(--color-warning)]"
                >
                  <WifiOff size={13} aria-hidden />
                  Some services are unavailable — displaying last available data
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* ---- Version, lower corner ---- */}
      <motion.div
        {...reveal(1.14)}
        className="relative flex items-center justify-between px-6 pb-5 text-[0.7rem] text-[var(--color-text-secondary)]"
      >
        <span className="data">Version {APP_VERSION}</span>
        <span>© {new Date().getFullYear()} Utopia Fulfillment Inc.</span>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- Progress bar ---------------- */

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunk)]"
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Initialization progress"
    >
      <motion.div
        className="h-full rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-primary) 0%, var(--color-accent) 100%)",
        }}
        initial={{ width: "0%" }}
        animate={{ width: `${Math.max(2, progress * 100)}%` }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  );
}

/* ---------------- Failure state ---------------- */

/**
 * Doc 02: "Never leave users on an endless loading screen." A critical failure
 * names the service, explains the error, and always offers a way forward.
 */
function StartupFailure({
  state,
  onContinueOffline,
}: {
  state: InitController;
  onContinueOffline: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-7 rounded-[var(--radius)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-wash)] p-5"
    >
      <div className="flex items-start gap-3">
        <AlertOctagon
          size={18}
          className="mt-0.5 shrink-0 text-[var(--color-danger)]"
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="text-[0.95rem] font-semibold text-[var(--color-text-primary)]">
            Unable to Complete Startup
          </h2>
          <p className="mt-1 text-[0.8rem] text-[var(--color-text-secondary)]">
            Failed service:{" "}
            <span className="font-medium text-[var(--color-text-primary)]">
              {state.failure?.stage}
            </span>
          </p>
          <p className="mt-0.5 text-[0.8rem] text-[var(--color-danger)]">
            {state.failure?.detail}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button
          onClick={state.retry}
          className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3.5 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          <RefreshCw size={14} aria-hidden />
          Retry
        </button>
        <button
          onClick={onContinueOffline}
          className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 py-2 text-[0.8rem] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-sunk)]"
        >
          <WifiOff size={14} aria-hidden />
          Continue Offline
        </button>
        <a
          href="mailto:trucking@utopiafulfillment.com?subject=TMS%20startup%20failure"
          className="ml-auto text-[0.76rem] text-[var(--color-text-secondary)] underline-offset-2 transition-colors hover:text-[var(--color-accent)] hover:underline"
        >
          Contact Administrator
        </a>
      </div>
    </motion.div>
  );
}

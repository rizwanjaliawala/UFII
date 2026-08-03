import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_STATISTICS,
  HEALTH_SERVICES,
  MIN_DISPLAY_MS,
  PIPELINE,
  type HealthService,
  type InitContext,
  type ServiceStatus,
  type StartupStatistics,
} from "../services/initialization";

/**
 * Drives the startup sequence and exposes real progress to the UI.
 *
 * Contract with docs/02 §Welcome & Enterprise Startup Experience:
 *   - Progress reflects genuine stage completion; no timers, no fake percent.
 *   - The screen is held for at least 800ms so a fast start doesn't flash.
 *   - Initialization is never blocked by the animation.
 *   - A non-critical failure degrades to Warning and offers offline entry;
 *     the user is never stranded on a loading screen.
 */

export type InitPhase = "running" | "ready" | "failed";

export interface InitState {
  phase: InitPhase;
  /** 0–1, computed from stages actually completed. */
  progress: number;
  currentMessage: string;
  currentStageIndex: number;
  totalStages: number;
  services: Record<HealthService, ServiceStatus>;
  serviceDetails: Partial<Record<HealthService, string>>;
  statistics: StartupStatistics;
  /** Set when a critical stage fails — drives the error panel. */
  failure: { stage: string; detail: string } | null;
  /** True when any non-critical service degraded — drives Offline Mode. */
  degraded: boolean;
  /** Cleared once the minimum display time has elapsed. */
  canDismiss: boolean;
}

/** What `useInitialization` returns — state plus its controls. */
export interface InitController extends InitState {
  retry: () => void;
}

const initialServices = () =>
  Object.fromEntries(HEALTH_SERVICES.map((s) => [s, "Waiting" as ServiceStatus])) as Record<
    HealthService,
    ServiceStatus
  >;

export function useInitialization(enabled = true): InitController {
  const [state, setState] = useState<InitState>({
    phase: "running",
    progress: 0,
    currentMessage: "Initializing Enterprise Platform...",
    currentStageIndex: 0,
    totalStages: PIPELINE.length,
    services: initialServices(),
    serviceDetails: {},
    statistics: EMPTY_STATISTICS,
    failure: null,
    degraded: false,
    canDismiss: false,
  });

  const [runToken, setRunToken] = useState(0);

  const retry = useCallback(() => {
    setState((s) => ({
      ...s,
      phase: "running",
      progress: 0,
      currentStageIndex: 0,
      services: initialServices(),
      serviceDetails: {},
      failure: null,
      degraded: false,
    }));
    setRunToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // No "has already started" guard here. StrictMode mounts, cleans up, then
    // mounts again — a guard would block the second run while the first had
    // already been aborted by the cleanup, leaving the pipeline dead at 0%.
    // Instead the cleanup aborts and the fresh run supersedes it. Stage
    // outcomes replace rather than accumulate, so a re-run is idempotent.
    const controller = new AbortController();
    const ctx: InitContext = { signal: controller.signal, data: {} };
    const startedAt = performance.now();

    // Minimum display time runs in parallel with the work — it never delays
    // initialization, it only delays the exit animation.
    const minimumElapsed = new Promise<void>((resolve) =>
      setTimeout(resolve, MIN_DISPLAY_MS),
    );

    (async () => {
      let degraded = false;

      for (let i = 0; i < PIPELINE.length; i++) {
        const stage = PIPELINE[i];
        if (controller.signal.aborted) return;

        setState((s) => ({
          ...s,
          currentStageIndex: i,
          currentMessage: stage.message,
          services: markServices(s.services, stage.services, "Connecting"),
        }));

        let outcome;
        try {
          outcome = await stage.run(ctx);
        } catch (error) {
          outcome = {
            status: stage.critical ? ("Failed" as const) : ("Warning" as const),
            detail: error instanceof Error ? error.message : "Unknown error",
          };
        }

        if (controller.signal.aborted) return;
        if (outcome.status !== "Ready") degraded = true;

        const completed = i + 1;
        setState((s) => ({
          ...s,
          progress: completed / PIPELINE.length,
          services: markServices(s.services, stage.services, outcome.status),
          serviceDetails: mergeDetails(s.serviceDetails, stage.services, outcome.detail),
          statistics: { ...s.statistics, ...outcome.stats },
          degraded,
        }));

        // Only a critical stage stops startup. Everything else degrades and
        // the user continues against the last synchronized data.
        if (outcome.status === "Failed" && stage.critical) {
          await minimumElapsed;
          setState((s) => ({
            ...s,
            phase: "failed",
            canDismiss: true,
            failure: {
              stage: stage.message.replace(/\.\.\.$/, ""),
              detail: outcome.detail ?? "Initialization could not complete",
            },
          }));
          return;
        }
      }

      await minimumElapsed;
      if (controller.signal.aborted) return;

      setState((s) => ({
        ...s,
        phase: "ready",
        progress: 1,
        currentMessage: "Ready.",
        canDismiss: true,
      }));

      if (import.meta.env.DEV) {
        console.info(
          `[startup] completed in ${Math.round(performance.now() - startedAt)}ms`,
        );
      }
    })();

    return () => controller.abort();
  }, [enabled, runToken]);

  return { ...state, retry };
}

function markServices(
  current: Record<HealthService, ServiceStatus>,
  services: HealthService[],
  status: ServiceStatus,
): Record<HealthService, ServiceStatus> {
  if (services.length === 0) return current;
  const next = { ...current };
  for (const service of services) next[service] = status;
  return next;
}

function mergeDetails(
  current: Partial<Record<HealthService, string>>,
  services: HealthService[],
  detail: string | undefined,
): Partial<Record<HealthService, string>> {
  if (!detail || services.length === 0) return current;
  const next = { ...current };
  for (const service of services) next[service] = detail;
  return next;
}

import { useCallback, useEffect, useState } from "react";
import type { ContainerFilters } from "../../services/api";

/**
 * Saved views (doc 03 §Container Search).
 *
 * Stored per browser in localStorage rather than server-side. A saved view is
 * a personal shortcut — "my Chicago overdue list" — not shared configuration,
 * and there is no per-user identity to key it to on the server yet. When RBAC
 * lands in Phase 5 this moves to a table without the UI changing.
 *
 * Only filter fields are persisted. `page` is deliberately excluded: a view
 * recalled three days later should open at the first page of current results,
 * not at page 4 of a list that has since changed underneath it.
 */

const STORAGE_KEY = "utopia.tms.savedViews.v1";
const MAX_VIEWS = 12;

export interface SavedView {
  id: string;
  name: string;
  filters: ContainerFilters;
  createdAt: string;
}

/** Fields that define a view. `page` and `pageSize` are not among them. */
const VIEW_KEYS = [
  "q",
  "trucker",
  "ssl",
  "terminal",
  "pod",
  "status",
  "risk",
  "sort",
  "direction",
] as const satisfies readonly (keyof ContainerFilters)[];

export function viewFilters(filters: ContainerFilters): ContainerFilters {
  const picked: ContainerFilters = {};
  for (const key of VIEW_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== "") {
      Object.assign(picked, { [key]: value });
    }
  }
  return picked;
}

/** Human-readable summary for a chip title, e.g. "Marlin Shipping · overdue". */
export function describeView(filters: ContainerFilters): string {
  const parts = [
    filters.q && `"${filters.q}"`,
    filters.trucker,
    filters.ssl,
    filters.terminal,
    filters.pod,
    filters.status,
    filters.risk,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "All containers";
}

function read(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Anything can be in localStorage — another tab, an older build, a user
    // editing it by hand. Validate rather than trust, or one bad entry breaks
    // the page on load.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        !!v &&
        typeof v === "object" &&
        typeof (v as SavedView).id === "string" &&
        typeof (v as SavedView).name === "string" &&
        !!(v as SavedView).filters,
    );
  } catch {
    return [];
  }
}

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>(read);

  // Keep tabs in step: saving a view in one tab should not be invisible in
  // another that is already open on the same screen.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setViews(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: SavedView[]) => {
    setViews(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota or private mode. The view stays for this session; losing a
      // shortcut is not worth interrupting the operator with an error.
    }
  }, []);

  const save = useCallback(
    (name: string, filters: ContainerFilters) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      const view: SavedView = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: trimmed.slice(0, 40),
        filters: viewFilters(filters),
        createdAt: new Date().toISOString(),
      };

      // Re-saving a name replaces it rather than creating a near-duplicate
      // the operator then has to tell apart.
      const withoutSameName = views.filter(
        (v) => v.name.toLowerCase() !== trimmed.toLowerCase(),
      );
      persist([view, ...withoutSameName].slice(0, MAX_VIEWS));
    },
    [views, persist],
  );

  const remove = useCallback(
    (id: string) => persist(views.filter((v) => v.id !== id)),
    [views, persist],
  );

  return { views, save, remove };
}

import { APP_ATTRIBUTION, APP_VERSION } from "@tms/shared";

/**
 * Global attribution footer.
 *
 * Rendered ONCE in the layout, below the routed content and inside the scroll
 * container, so it never overlaps data or floats over tables. The text lives
 * in `@tms/shared` so it is never duplicated in source.
 *
 * Caption tier and non-interactive by design — it is a quiet credit line, not
 * something that should compete with operational data.
 */
export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] px-6 py-4">
      <div className="mx-auto flex max-w-[var(--max-width-app)] flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[var(--text-caption)] text-[var(--color-text-secondary)]">
          {APP_ATTRIBUTION}
        </p>
        <p className="data text-[var(--text-caption)] text-[var(--color-text-disabled)]">
          Utopia TMS v{APP_VERSION}
        </p>
      </div>
    </footer>
  );
}

import { Download } from "lucide-react";
import clsx from "clsx";

/**
 * CSV export trigger.
 *
 * A plain anchor, not a fetch. The server sends `Content-Disposition:
 * attachment`, so the browser saves the file without JavaScript holding the
 * whole export in memory, and the download survives a navigation away from
 * the page mid-transfer.
 *
 * `href` carries the same filters as the current view — the export must match
 * what the operator is looking at, not the whole fleet.
 */
export function ExportButton({
  href,
  label = "Export CSV",
  count,
  className,
}: {
  href: string;
  label?: string;
  /** Shown so the operator knows the size before clicking. */
  count?: number;
  className?: string;
}) {
  return (
    <a
      href={href}
      download
      className={clsx(
        "flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[0.8rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)]",
        className,
      )}
      title={
        count === undefined
          ? "Download the current selection as CSV"
          : `Download ${count.toLocaleString("en-US")} rows as CSV`
      }
    >
      <Download size={14} aria-hidden />
      {label}
      {count !== undefined && (
        <span className="data text-[0.72rem] text-[var(--color-text-secondary)]">
          {count.toLocaleString("en-US")}
        </span>
      )}
    </a>
  );
}

import { Link } from "react-router-dom";
import { Check, Copy, ExternalLink, PencilLine, Ship } from "lucide-react";
import clsx from "clsx";
import type { Container } from "@tms/shared";

/**
 * Quick Actions (doc 04 §Quick Actions).
 *
 * Only actions that are real. Nothing here is a stub for a later phase —
 * a disabled "Send reminder" button teaches operators the screen is
 * decorative, and they stop reading it.
 *
 * Each has a keyboard equivalent, shown so the shortcut is discoverable
 * rather than documented somewhere nobody opens.
 */
export function QuickActions({
  container,
  copied,
  onCopy,
  onEdit,
}: {
  container: Container;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onCopy}
        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[0.78rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)]"
      >
        {copied ? (
          <Check size={13} className="text-[var(--color-success)]" aria-hidden />
        ) : (
          <Copy size={13} aria-hidden />
        )}
        {copied ? "Copied" : "Copy number"}
        <Kbd>C</Kbd>
      </button>

      <button
        onClick={onEdit}
        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[0.78rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)]"
      >
        <PencilLine size={13} aria-hidden />
        Edit
        <Kbd>E</Kbd>
      </button>

      {container.trucker && (
        <Link
          to={`/containers?trucker=${encodeURIComponent(container.trucker)}`}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[0.78rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)]"
        >
          <Ship size={13} aria-hidden />
          This trucker's containers
        </Link>
      )}

      {container.terminal && (
        <Link
          to={`/containers?terminal=${encodeURIComponent(container.terminal)}&risk=overdue`}
          className={clsx(
            "flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[0.78rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)]",
          )}
        >
          <ExternalLink size={13} aria-hidden />
          Overdue at this terminal
        </Link>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="ml-0.5 rounded border border-[var(--color-border)] px-1 text-[0.6rem] text-[var(--color-text-disabled)]">
      {children}
    </kbd>
  );
}

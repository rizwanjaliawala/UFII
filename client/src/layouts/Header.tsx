import { Bell, HelpCircle, RefreshCw, Search, Sparkles, User } from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";

/**
 * Sticky application header (doc 02 §Header).
 *
 * Contains global search, Refresh Data, AI Assistant, Notifications, Help and
 * the user menu. Search is available from every page (doc 03 §Dashboard Search).
 */
export function Header({
  onRefresh,
  refreshing,
  onOpenSearch,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  onOpenSearch: () => void;
}) {
  return (
    <header className="glass sticky top-0 z-10 flex h-[var(--header-height)] shrink-0 items-center gap-4 border-x-0 border-t-0 border-b-[var(--color-border)] px-6">
      {/* ---- Global search ---- */}
      <button
        onClick={onOpenSearch}
        className="group flex h-9 max-w-[420px] min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-left transition-colors hover:border-[var(--color-border-strong)]"
        aria-label="Open global search"
      >
        <Search size={15} className="shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
        <span className="truncate text-[0.82rem] text-[var(--color-text-secondary)]">
          Search containers, vendors, invoices, PU…
        </span>
        <kbd className="data ml-auto hidden shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[0.65rem] text-[var(--color-text-secondary)] sm:block">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
          aria-label="Refresh data"
        >
          <motion.span
            animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
            transition={
              refreshing
                ? { duration: 0.9, repeat: Infinity, ease: "linear" }
                : { duration: 0.2 }
            }
            className="flex"
          >
            <RefreshCw size={15} aria-hidden />
          </motion.span>
          <span className="hidden sm:inline">
            {refreshing ? "Refreshing…" : "Refresh Data"}
          </span>
        </button>

        <IconButton label="AI Assistant" icon={Sparkles} />
        <IconButton label="Notifications" icon={Bell} badge={0} />
        <IconButton label="Help" icon={HelpCircle} />

        <button
          className="ml-1 flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-sunk)]"
          aria-label="User menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-wash)] text-[var(--color-primary)]">
            <User size={16} aria-hidden />
          </span>
        </button>
      </div>
    </header>
  );
}

function IconButton({
  label,
  icon: Icon,
  badge,
}: {
  label: string;
  icon: typeof Bell;
  badge?: number;
}) {
  return (
    <button
      className="relative rounded-[var(--radius-sm)] p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-sunk)] hover:text-[var(--color-text-primary)]"
      aria-label={label}
      title={label}
    >
      <Icon size={18} aria-hidden />
      {!!badge && badge > 0 && (
        <span
          className={clsx(
            "data absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center",
            "rounded-full bg-[var(--color-danger)] px-1 text-[0.6rem] font-semibold text-white",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

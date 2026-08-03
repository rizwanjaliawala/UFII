import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Box, FileText, Search, Truck } from "lucide-react";
import clsx from "clsx";
import { api, type SearchHit } from "../services/api";

/**
 * Global search (doc 03 §Global Search).
 *
 * Ctrl+K / ⌘K from anywhere. Keyboard-first: an operator reading a container
 * number off an email should be able to reach that container without touching
 * the mouse, which is the whole reason the palette exists.
 */

const KIND_ICON = { container: Box, vendor: Truck, invoice: FileText } as const;
const KIND_LABEL = { container: "Container", vendor: "Vendor", invoice: "Invoice" } as const;

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  // Open on Ctrl+K / ⌘K, close on Escape. Bound to the window so it works
  // regardless of what has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setCursor(0);
      // The input mounts with the dialog, so focus has to wait a frame.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setHits([]);
      setTruncated(false);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .globalSearch(query.trim())
        .then((result) => {
          // A slower earlier keystroke must not overwrite a newer result.
          if (id !== requestId.current) return;
          setHits(result.hits);
          setTruncated(result.truncated);
          setCursor(0);
        })
        .catch(() => {
          if (id === requestId.current) setHits([]);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 180);

    return () => clearTimeout(timer);
  }, [query, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      navigate(hit.href);
    },
    [navigate],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, hits.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === "Enter" && hits[cursor]) {
      event.preventDefault();
      go(hits[cursor]);
    }
  };

  // Group headers are rendered inline, so the flat list keeps arrow-key
  // navigation simple — the cursor indexes hits, never headers.
  const grouped = useMemo(() => {
    const order: SearchHit["kind"][] = ["container", "vendor", "invoice"];
    return order
      .map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind) }))
      .filter((group) => group.items.length > 0);
  }, [hits]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/35 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.985 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            className="glass-solid w-full max-w-xl overflow-hidden rounded-[var(--radius)] shadow-[var(--shadow-modal)]"
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-3">
              <Search size={16} className="shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Container, vendor or invoice number…"
                className="w-full bg-transparent text-[0.92rem] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-disabled)]"
              />
              <kbd className="shrink-0 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[0.62rem] text-[var(--color-text-secondary)]">
                ESC
              </kbd>
            </div>

            <div className="max-h-[52vh] overflow-auto">
              {query.trim().length < 2 ? (
                <p className="px-4 py-8 text-center text-[0.8rem] text-[var(--color-text-secondary)]">
                  Type at least two characters.
                </p>
              ) : loading && hits.length === 0 ? (
                <div className="flex flex-col gap-2 p-3">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="shimmer h-10 rounded-[var(--radius-sm)]" />
                  ))}
                </div>
              ) : hits.length === 0 ? (
                <p className="px-4 py-8 text-center text-[0.8rem] text-[var(--color-text-secondary)]">
                  Nothing matches “{query.trim()}”.
                </p>
              ) : (
                grouped.map((group) => (
                  <div key={group.kind}>
                    <div className="sticky top-0 bg-[var(--color-surface-sunk)] px-4 py-1.5 text-[0.62rem] font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase">
                      {KIND_LABEL[group.kind]}
                    </div>
                    {group.items.map((hit) => {
                      const index = hits.indexOf(hit);
                      const Icon = KIND_ICON[hit.kind];
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          onClick={() => go(hit)}
                          onMouseEnter={() => setCursor(index)}
                          className={clsx(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                            index === cursor && "bg-[var(--color-accent-wash)]",
                          )}
                        >
                          <Icon
                            size={15}
                            aria-hidden
                            className="shrink-0 text-[var(--color-text-secondary)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="data block truncate text-[0.84rem] font-medium text-[var(--color-text-primary)]">
                              {hit.title}
                            </span>
                            <span className="block truncate text-[0.72rem] text-[var(--color-text-secondary)]">
                              {hit.subtitle}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-2 text-[0.68rem] text-[var(--color-text-secondary)]">
              <span>↑↓ to move · ↵ to open</span>
              {/* Say when the list is capped. A palette silently showing six
                  of ninety matches teaches operators to distrust it. */}
              {truncated && (
                <span>
                  More matches —{" "}
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate(`/containers?q=${encodeURIComponent(query.trim())}`);
                    }}
                    className="font-medium text-[var(--color-primary)] hover:underline"
                  >
                    open Container Search
                  </button>
                </span>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

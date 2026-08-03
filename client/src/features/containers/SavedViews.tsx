import { useState } from "react";
import { Bookmark, BookmarkPlus, X } from "lucide-react";
import clsx from "clsx";
import type { ContainerFilters } from "../../services/api";
import { describeView, useSavedViews, viewFilters } from "./useSavedViews";

/**
 * Saved view chips above the container table.
 *
 * Applying a view always resets to page 1 — see the note in `useSavedViews`.
 */
export function SavedViews({
  filters,
  onApply,
}: {
  filters: ContainerFilters;
  onApply: (filters: ContainerFilters) => void;
}) {
  const { views, save, remove } = useSavedViews();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const active = viewFilters(filters);
  const activeKey = JSON.stringify(active);
  const hasFilters = Object.keys(active).length > 0;

  const commit = () => {
    save(name, filters);
    setName("");
    setNaming(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wide text-[var(--color-text-secondary)] uppercase">
        <Bookmark size={12} aria-hidden />
        Views
      </span>

      {views.length === 0 && !naming && (
        <span className="text-[0.74rem] text-[var(--color-text-disabled)]">
          None saved yet — filter the list, then save it
        </span>
      )}

      {views.map((view) => {
        const isActive = JSON.stringify(view.filters) === activeKey;
        return (
          <span
            key={view.id}
            className={clsx(
              "group flex items-center rounded-full border transition-colors",
              isActive
                ? "border-[var(--color-primary)] bg-[var(--color-primary-wash)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]",
            )}
          >
            <button
              onClick={() => onApply({ ...view.filters, page: 1 })}
              title={describeView(view.filters)}
              className={clsx(
                "max-w-[180px] truncate py-1.5 pr-1 pl-3 text-[0.76rem]",
                isActive
                  ? "font-semibold text-[var(--color-primary)]"
                  : "text-[var(--color-text-primary)]",
              )}
            >
              {view.name}
            </button>
            <button
              onClick={() => remove(view.id)}
              aria-label={`Delete view ${view.name}`}
              title={`Delete "${view.name}"`}
              className="rounded-full py-1.5 pr-2.5 pl-1 text-[var(--color-text-disabled)] transition-colors hover:text-[var(--color-danger)]"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        );
      })}

      {naming ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setNaming(false);
            }}
            placeholder="Name this view"
            maxLength={40}
            className="w-[150px] rounded-full border border-[var(--color-primary)] bg-[var(--color-surface)] px-3 py-1.5 text-[0.76rem] text-[var(--color-text-primary)] outline-none"
          />
          <button
            onClick={commit}
            disabled={!name.trim()}
            className="rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-[0.74rem] font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
        </span>
      ) : (
        <button
          onClick={() => setNaming(true)}
          disabled={!hasFilters}
          title={
            hasFilters
              ? "Save the current filters as a view"
              : "Apply a filter first — there is nothing to save yet"
          }
          className="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--color-border-strong)] px-3 py-1.5 text-[0.76rem] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[var(--color-border-strong)] disabled:hover:text-[var(--color-text-secondary)]"
        >
          <BookmarkPlus size={12} aria-hidden />
          Save view
        </button>
      )}
    </div>
  );
}

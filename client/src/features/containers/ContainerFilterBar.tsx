import { Search, X } from "lucide-react";
import clsx from "clsx";
import type { ContainerFilters, FilterOption, FilterOptions } from "../../services/api";

/**
 * Filter controls for Container Search (doc 03 §Filters).
 *
 * Every dropdown shows its option counts, so an operator can see how much data
 * sits behind a choice before making it.
 */

const RISK_OPTIONS: FilterOption[] = [
  { value: "overdue", count: 0 },
  { value: "critical", count: 0 },
  { value: "warning", count: 0 },
  { value: "safe", count: 0 },
  { value: "cleared", count: 0 },
];

const RISK_LABEL: Record<string, string> = {
  overdue: "Overdue",
  critical: "LFD today",
  warning: "LFD approaching",
  safe: "On time",
  cleared: "Cleared",
};

export function ContainerFilterBar({
  filters,
  options,
  onChange,
  onReset,
  resultCount,
}: {
  filters: ContainerFilters;
  options: FilterOptions | null;
  onChange: (patch: Partial<ContainerFilters>) => void;
  onReset: () => void;
  resultCount: number;
}) {
  const activeCount = [
    filters.trucker,
    filters.ssl,
    filters.terminal,
    filters.pod,
    filters.status,
    filters.risk,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative min-w-[280px] flex-1">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-text-secondary)]"
          aria-hidden
        />
        <input
          value={filters.q ?? ""}
          onChange={(event) => onChange({ q: event.target.value, page: 1 })}
          placeholder="Container, MBL, ISA, FC, trucker, terminal…"
          aria-label="Search containers"
          className="data w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pr-8 pl-9 text-[0.82rem] text-[var(--color-text-primary)] placeholder:font-sans placeholder:text-[var(--color-text-disabled)] focus:border-[var(--color-primary)] focus:outline-none"
        />
        {filters.q && (
          <button
            onClick={() => onChange({ q: "", page: 1 })}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <Select
        label="All truckers"
        value={filters.trucker}
        options={options?.truckers ?? []}
        onChange={(value) => onChange({ trucker: value, page: 1 })}
      />
      <Select
        label="All SSLs"
        value={filters.ssl}
        options={options?.ssls ?? []}
        onChange={(value) => onChange({ ssl: value, page: 1 })}
      />
      <Select
        label="All PODs"
        value={filters.pod}
        options={options?.pods ?? []}
        onChange={(value) => onChange({ pod: value, page: 1 })}
      />
      <Select
        label="All terminals"
        value={filters.terminal}
        options={options?.terminals ?? []}
        onChange={(value) => onChange({ terminal: value, page: 1 })}
      />
      <Select
        label="Any status"
        value={filters.status}
        options={options?.statuses ?? []}
        onChange={(value) => onChange({ status: value, page: 1 })}
      />
      <Select
        label="Any LFD risk"
        value={filters.risk}
        options={RISK_OPTIONS}
        labelFor={(value) => RISK_LABEL[value] ?? value}
        showCounts={false}
        onChange={(value) => onChange({ risk: value, page: 1 })}
      />

      {(activeCount > 0 || filters.q) && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-[0.78rem] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          <X size={13} aria-hidden />
          Clear
        </button>
      )}

      <span className="data ml-auto shrink-0 text-[0.78rem] text-[var(--color-text-secondary)]">
        {resultCount.toLocaleString("en-US")} result{resultCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  labelFor,
  showCounts = true,
}: {
  label: string;
  value: string | undefined;
  options: FilterOption[];
  onChange: (value: string | undefined) => void;
  labelFor?: (value: string) => string;
  showCounts?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
      aria-label={label}
      className={clsx(
        "max-w-[190px] truncate rounded-[var(--radius-sm)] border bg-[var(--color-surface)] px-2.5 py-2 text-[0.78rem] focus:outline-none",
        value
          ? "border-[var(--color-primary)] font-medium text-[var(--color-primary)]"
          : "border-[var(--color-border)] text-[var(--color-text-secondary)]",
      )}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {labelFor ? labelFor(option.value) : option.value}
          {showCounts ? ` (${option.count})` : ""}
        </option>
      ))}
    </select>
  );
}

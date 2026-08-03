import { motion } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";
import clsx from "clsx";
import {
  formatContainerNumber,
  freeTimeLabel,
  lfdRisk,
  formatDateShort,
  type Container,
  type LfdRisk,
} from "@tms/shared";
import type { ContainerFilters } from "../../services/api";

/**
 * Container results table.
 *
 * Enterprise table behaviour per doc 02: sticky header, sortable columns,
 * zebra rows, hover highlight, keyboard navigation.
 *
 * The surface is `.glass-solid` rather than `.glass` — a column of container
 * numbers read through heavy translucency is a support ticket waiting to
 * happen, so density beats transparency here.
 */

/** Risk → colour. Centralised so a palette retune is one edit. */
const RISK_STYLE: Record<LfdRisk, { dot: string; text: string; label: string }> = {
  overdue: {
    dot: "bg-[var(--color-danger)]",
    text: "text-[var(--color-danger)]",
    label: "Overdue",
  },
  critical: {
    dot: "bg-[var(--color-danger)]",
    text: "text-[var(--color-danger)]",
    label: "LFD today",
  },
  warning: {
    dot: "bg-[var(--color-warning)]",
    text: "text-[var(--color-warning)]",
    label: "Approaching",
  },
  safe: {
    dot: "bg-[var(--color-success)]",
    text: "text-[var(--color-success)]",
    label: "On time",
  },
  cleared: {
    dot: "bg-[var(--color-text-disabled)]",
    text: "text-[var(--color-text-secondary)]",
    label: "Cleared",
  },
};

type SortKey = NonNullable<ContainerFilters["sort"]>;

const COLUMNS: { key: string; label: string; sort?: SortKey; align?: "right" }[] = [
  { key: "container", label: "Container", sort: "container" },
  { key: "status", label: "Status" },
  { key: "lfd", label: "LFD", sort: "lfd" },
  { key: "freeTime", label: "Free time" },
  { key: "appointment", label: "Appointment" },
  { key: "trucker", label: "Trucker" },
  { key: "ssl", label: "SSL" },
  { key: "terminal", label: "Terminal" },
  { key: "pod", label: "POD" },
];

export function ContainerTable({
  rows,
  sort,
  direction,
  onSort,
  onSelect,
  selected,
}: {
  rows: Container[];
  sort: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onSelect: (containerNumber: string) => void;
  selected: string | null;
}) {
  return (
    <div className="glass-solid overflow-hidden rounded-[var(--radius)] shadow-[var(--shadow-card)]">
      <div className="max-h-[calc(100vh-22rem)] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10">
            <tr>
              {COLUMNS.map((column) => {
                const active = column.sort && sort === column.sort;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunk)] px-3 py-2.5 text-[0.68rem] font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase"
                  >
                    {column.sort ? (
                      <button
                        onClick={() => onSort(column.sort!)}
                        className={clsx(
                          "flex items-center gap-1 transition-colors hover:text-[var(--color-primary)]",
                          active && "text-[var(--color-primary)]",
                        )}
                        aria-sort={
                          active
                            ? direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        {column.label}
                        {active &&
                          (direction === "asc" ? (
                            <ArrowUp size={12} aria-hidden />
                          ) : (
                            <ArrowDown size={12} aria-hidden />
                          ))}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((container, index) => {
              const risk = lfdRisk(container);
              const style = RISK_STYLE[risk];
              const isSelected = selected === container.containerNumber;

              return (
                <motion.tr
                  key={container.containerNumber}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15, delay: Math.min(index * 0.008, 0.2) }}
                  tabIndex={0}
                  onClick={() => onSelect(container.containerNumber)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(container.containerNumber);
                    }
                  }}
                  className={clsx(
                    "cursor-pointer transition-colors",
                    isSelected
                      ? "bg-[var(--color-primary-wash)]"
                      : index % 2 === 1
                        ? "bg-[var(--color-surface-sunk)]/40"
                        : "",
                    !isSelected && "hover:bg-[var(--color-accent-wash)]",
                  )}
                >
                  <Cell>
                    <span className="flex items-center gap-2">
                      <span
                        className={clsx("h-2 w-2 shrink-0 rounded-full", style.dot)}
                        title={style.label}
                      />
                      <span className="data font-medium text-[var(--color-text-primary)]">
                        {formatContainerNumber(container.containerNumber)}
                      </span>
                    </span>
                  </Cell>

                  <Cell>
                    <span className="rounded-full bg-[var(--color-surface-sunk)] px-2 py-0.5 text-[0.7rem] text-[var(--color-text-secondary)]">
                      {container.status}
                    </span>
                  </Cell>

                  <Cell mono>{formatDateShort(container.lastFreeDay)}</Cell>

                  <Cell>
                    <span className={clsx("data text-[0.78rem] font-medium", style.text)}>
                      {freeTimeLabel(container)}
                    </span>
                  </Cell>

                  <Cell mono>{formatDateShort(container.appointmentDate)}</Cell>
                  <Cell>{container.trucker ?? "—"}</Cell>
                  <Cell>{container.ssl ?? "—"}</Cell>
                  <Cell truncate>{container.terminal ?? "—"}</Cell>
                  <Cell truncate>{container.pod ?? "—"}</Cell>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({
  children,
  mono,
  truncate,
}: {
  children: React.ReactNode;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <td
      className={clsx(
        "border-b border-[var(--color-border)] px-3 py-2 text-[0.8rem] text-[var(--color-text-secondary)]",
        mono && "data",
        truncate && "max-w-[180px] truncate",
      )}
    >
      {children}
    </td>
  );
}

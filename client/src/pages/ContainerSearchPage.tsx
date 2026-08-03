import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RefreshCw } from "lucide-react";
import { formatRelative } from "@tms/shared";
import {
  api,
  type ContainerFilters,
  type ContainerPage,
  type FilterOptions,
} from "../services/api";
import { ContainerTable } from "../features/containers/ContainerTable";
import { ContainerFilterBar } from "../features/containers/ContainerFilterBar";
import { Container360Drawer } from "../features/container360/Container360Drawer";
import { SavedViews } from "../features/containers/SavedViews";
import { ExportButton } from "../components/ExportButton";

/**
 * Container Search — the operational entry point (doc 03 §Container Search).
 *
 * Filtering, sorting and pagination are server-side: with ~4,400 containers,
 * shipping one page of 50 rows keeps the payload small and search well inside
 * the <300ms target from doc 10.
 *
 * Selecting a row opens Container 360 and pushes /containers/:containerNumber,
 * so any container is deep-linkable and the back button behaves.
 */

const DEFAULT_FILTERS: ContainerFilters = {
  sort: "urgency",
  direction: "asc",
  page: 1,
  pageSize: 50,
};

/**
 * Seed the filters from the URL.
 *
 * The Dashboard's Needs Attention widget links here as
 * `/containers?risk=overdue`, and the command palette as
 * `/containers?trucker=…`. Without this the page ignored those parameters and
 * opened on the unfiltered list — the link appeared to work while quietly
 * showing the wrong thing.
 *
 * Only known keys are read; anything else in the query string is discarded
 * rather than passed through to the API.
 */
function filtersFromUrl(params: URLSearchParams): ContainerFilters {
  const seeded: ContainerFilters = { ...DEFAULT_FILTERS };
  const text = ["q", "trucker", "ssl", "terminal", "pod", "status"] as const;

  for (const key of text) {
    const value = params.get(key);
    if (value) Object.assign(seeded, { [key]: value });
  }

  const risk = params.get("risk");
  if (risk && ["overdue", "critical", "warning", "safe", "cleared"].includes(risk)) {
    seeded.risk = risk;
  }

  const sort = params.get("sort");
  if (sort && ["urgency", "lfd", "container", "eta", "updated"].includes(sort)) {
    seeded.sort = sort as ContainerFilters["sort"];
  }

  const direction = params.get("direction");
  if (direction === "asc" || direction === "desc") seeded.direction = direction;

  return seeded;
}

export function ContainerSearchPage() {
  const navigate = useNavigate();
  const { containerNumber } = useParams<{ containerNumber?: string }>();
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState<ContainerFilters>(() =>
    filtersFromUrl(searchParams),
  );

  // Re-seed when the query string changes under us — clicking a second
  // Needs Attention link while already on this page is a navigation, not a
  // remount, so state would otherwise keep the first link's filters.
  const searchKey = searchParams.toString();
  useEffect(() => {
    if (searchKey) setFilters(filtersFromUrl(new URLSearchParams(searchKey)));
  }, [searchKey]);
  const [page, setPage] = useState<ContainerPage | null>(null);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Debounce only the free-text query; dropdowns should feel immediate.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(filters.q ?? ""), 220);
    return () => clearTimeout(timer);
  }, [filters.q]);

  // Guards against a slow earlier response overwriting a newer one.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);

    api
      .listContainers({ ...filters, q: debouncedQuery })
      .then((result) => {
        if (id !== requestId.current) return;
        setPage(result);
        setError(null);
      })
      .catch((err: Error) => {
        if (id !== requestId.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [filters, debouncedQuery]);

  useEffect(() => {
    api.getFilterOptions().then(setOptions).catch(() => setOptions(null));
  }, []);

  const patchFilters = useCallback((patch: Partial<ContainerFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const handleSort = useCallback((key: NonNullable<ContainerFilters["sort"]>) => {
    setFilters((current) => ({
      ...current,
      sort: key,
      // Re-clicking the active column flips direction.
      direction: current.sort === key && current.direction === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshContainers();
      const result = await api.listContainers({ ...filters, q: debouncedQuery });
      setPage(result);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const rows = page?.rows ?? [];
  const total = page?.total ?? 0;
  const currentPage = page?.page ?? 1;
  const totalPages = page?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-5">
      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[var(--text-page-title)] font-bold text-[var(--color-text-primary)]">
            Container Search
          </h1>
          <p className="mt-1.5 text-[var(--text-body)] text-[var(--color-text-secondary)]">
            {/* The provenance differs by source and must be stated
                accurately: the sheet path counts monthly tabs, the database
                path has none to count. Naming the source is the point of the
                line — an operator seeing a stale figure needs to know which
                store it came from. */}
            {page?.source
              ? `${page.source.containers.toLocaleString("en-US")} containers · ${
                  page.source.tabsRead
                    ? `${page.source.tabsRead} monthly tabs · read ${formatRelative(page.source.loadedAt)}`
                    : `database · synced ${formatRelative(page.source.loadedAt)}`
                }`
              : "Loading live operational data"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* The export carries the active filters, not the loaded page —
              exporting 50 of 4,400 rows without saying so would be worse
              than not offering it. */}
          <ExportButton
            href={api.containersExportUrl({ ...filters, q: debouncedQuery, page: undefined })}
            count={total}
          />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[0.8rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)] disabled:opacity-60"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : undefined}
              aria-hidden
            />
            {refreshing ? "Reloading…" : "Reload source"}
          </button>
        </div>
      </div>

      {/* ---- Filters ---- */}
      <ContainerFilterBar
        filters={filters}
        options={options}
        onChange={patchFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        resultCount={total}
      />

      <SavedViews
        filters={filters}
        onApply={(view) => setFilters({ ...DEFAULT_FILTERS, ...view })}
      />

      {/* ---- Results ---- */}
      {error ? (
        <ErrorState message={error} onRetry={() => patchFilters({})} />
      ) : loading && !page ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState onReset={() => setFilters(DEFAULT_FILTERS)} />
      ) : (
        <>
          <ContainerTable
            rows={rows}
            sort={filters.sort ?? "urgency"}
            direction={filters.direction ?? "asc"}
            onSort={handleSort}
            onSelect={(number) => navigate(`/containers/${number}`)}
            selected={containerNumber ?? null}
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.78rem] text-[var(--color-text-secondary)]">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <PageButton
                disabled={currentPage <= 1}
                onClick={() => patchFilters({ page: currentPage - 1 })}
                label="Previous page"
              >
                <ChevronLeft size={15} aria-hidden />
              </PageButton>
              <PageButton
                disabled={currentPage >= totalPages}
                onClick={() => patchFilters({ page: currentPage + 1 })}
                label="Next page"
              >
                <ChevronRight size={15} aria-hidden />
              </PageButton>
            </div>
          </div>
        </>
      )}

      {/* ---- Container 360 ---- */}
      <Container360Drawer
        containerNumber={containerNumber ?? null}
        onClose={() => navigate("/containers")}
      />
    </div>
  );
}

/* ---------------- States ---------------- */

function PageButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function TableSkeleton() {
  return (
    <div className="glass-solid overflow-hidden rounded-[var(--radius)] p-4">
      <div className="flex flex-col gap-2">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="shimmer h-9 w-full rounded-[var(--radius-sm)]" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-sunk)] text-[var(--color-text-secondary)]">
        <Inbox size={24} aria-hidden />
      </span>
      <div>
        <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
          No containers match these filters
        </p>
        <p className="mt-1.5 text-[var(--text-body)] text-[var(--color-text-secondary)]">
          Try a shorter search term, or clear the filters to see the full fleet.
        </p>
      </div>
      <button
        onClick={onReset}
        className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
      >
        Clear filters
      </button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-danger-wash)] text-[var(--color-danger)]">
        <AlertTriangle size={24} aria-hidden />
      </span>
      <div>
        <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
          Could not load containers
        </p>
        <p className="mt-1.5 max-w-md text-[var(--text-body)] text-[var(--color-text-secondary)]">
          {message}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
      >
        Retry
      </button>
    </div>
  );
}

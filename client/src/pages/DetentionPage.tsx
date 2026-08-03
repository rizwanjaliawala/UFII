import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Info, RefreshCw, Search, X } from "lucide-react";
import clsx from "clsx";
import { formatContainerNumber, formatCurrency } from "@tms/shared";
import { api, type DetentionSummary } from "../services/api";
import { ExportButton } from "../components/ExportButton";

/**
 * Detention & Demurrage (doc 03 §D&D).
 *
 * The invoice log across all three Source Sheet 2 tabs. Read-only: parsing
 * PDFs and the container-match review workflow belong with the document
 * pipeline, and doc 09 is explicit that nothing is logged without approval —
 * so this shows what the source already contains and creates nothing.
 */

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } },
};

type Tab = "invoices" | "credits" | "fbu";

export function DetentionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<DetentionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("invoices");

  // Seeded from the URL so the command palette can deep-link an invoice.
  const [q, setQ] = useState(searchParams.get("invoice") ?? "");
  const [party, setParty] = useState("");
  const [debounced, setDebounced] = useState(q);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q), 220);
    return () => clearTimeout(timer);
  }, [q]);

  const load = () => {
    setLoading(true);
    api
      // The whole ledger is 315 invoices / 201 credit notes / 17 FBU, so it
      // fits in one request. Leaving the default 200 cap in place would make
      // the tab labels read "Invoices (200)" against a stated total of 315.
      .getDetention({
        q: debounced || undefined,
        responsibleParty: party || undefined,
        limit: 1000,
      })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [debounced, party]);

  const filtersActive = Boolean(debounced || party);
  const clear = () => {
    setQ("");
    setParty("");
    setSearchParams({});
  };

  const exportHref = useMemo(
    () =>
      api.detentionExportUrl({
        q: debounced || undefined,
        responsibleParty: party || undefined,
      }),
    [debounced, party],
  );

  if (loading && !data) return <Skeleton />;
  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  if (!data.available) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Info size={26} className="text-[var(--color-text-secondary)]" aria-hidden />
        <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
          Invoice data unavailable
        </p>
        <p className="max-w-md text-[var(--text-body)] text-[var(--color-text-secondary)]">
          The database is not configured, so no invoice totals can be reported.
          Showing zero here would read as "nothing owing".
        </p>
      </div>
    );
  }

  const { totals } = data;

  return (
    <motion.div initial="hidden" animate="show" className="flex flex-col gap-5">
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[var(--text-page-title)] font-bold text-[var(--color-text-primary)]">
            Detention &amp; Demurrage
          </h1>
          <p className="mt-1.5 text-[var(--text-body)] text-[var(--color-text-secondary)]">
            {totals.invoices} invoices over {totals.invoiceLines} container lines ·{" "}
            {formatCurrency(totals.net)} net of credits
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton href={exportHref} count={data.invoices.length} />
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[0.8rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)] disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} aria-hidden />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* ---- Totals ---- */}
      <motion.div variants={rise} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Total label="Charged" value={formatCurrency(totals.charged)} hint="D&D invoice lines" />
        <Total
          label="Credited back"
          value={formatCurrency(totals.credited)}
          hint="Credit notes"
          tone="success"
        />
        <Total
          label="Net"
          value={formatCurrency(totals.net)}
          hint="Charged less credits"
          tone={totals.net > 0 ? "danger" : undefined}
        />
        <Total label="FBU charges" value={formatCurrency(totals.fbu)} hint="Billed separately" />
      </motion.div>

      {totals.unmatchedCreditNotes > 0 && (
        <motion.p
          variants={rise}
          className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--color-warning)] bg-[var(--color-warning-wash)] px-3.5 py-2.5 text-[0.78rem] text-[var(--color-text-primary)]"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
          <span>
            <strong>{totals.unmatchedCreditNotes}</strong> of {data.creditNotes.length}{" "}
            credit notes name a container that is not in the fleet — most
            likely movements predating the earliest monthly tab. They still
            count toward the credited total, but cannot be attributed to a
            container, a vendor or a charge.
          </span>
        </motion.p>
      )}

      {/* ---- Breakdown ---- */}
      <motion.div variants={rise} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Breakdown
          title="By charge type"
          rows={data.byChargeType.map((row) => ({
            name: row.type,
            meta: `${row.count} line${row.count === 1 ? "" : "s"}`,
            amount: row.amount,
          }))}
          total={totals.charged}
        />
        <Breakdown
          title="By responsible party"
          rows={data.byResponsibleParty.map((row) => ({
            name: row.name,
            meta: `${row.invoices} invoices`,
            amount: row.amount,
          }))}
          total={totals.charged}
          onSelect={(name) => setParty(name === party ? "" : name)}
          selected={party}
        />
      </motion.div>

      {/* ---- Filter + tabs ---- */}
      <motion.div variants={rise} className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
          <Search size={14} className="shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Invoice or container number…"
            className="w-full bg-transparent text-[0.82rem] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-disabled)]"
          />
        </div>
        {filtersActive && (
          <button
            onClick={clear}
            className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-[0.78rem] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <X size={13} aria-hidden />
            Clear {party && `· ${party}`}
          </button>
        )}
        <div className="flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
          {(
            [
              ["invoices", `Invoices (${data.invoices.length})`],
              ["credits", `Credit notes (${data.creditNotes.length})`],
              ["fbu", `FBU (${data.fbuCharges.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={clsx(
                "rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-1.5 text-[0.76rem] transition-colors",
                tab === value
                  ? "bg-[var(--color-primary)] font-semibold text-white"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* ---- Table ---- */}
      <motion.section
        variants={rise}
        className="glass-solid overflow-hidden rounded-[var(--radius)] shadow-[var(--shadow-card)]"
      >
        <div className="max-h-[56vh] overflow-auto">
          {tab === "invoices" && (
            <Table
              headers={[
                "Invoice",
                "Amount",
                "Containers",
                "Charge types",
                "Responsible",
                "Payment",
              ]}
              empty="No invoices match."
              rows={data.invoices.map((invoice) => [
                <span key="n" className="data font-medium text-[var(--color-text-primary)]">
                  {invoice.invoiceNumber}
                </span>,
                <span key="a" className="data font-medium text-[var(--color-text-primary)]">
                  {formatCurrency(invoice.totalAmount)}
                </span>,
                <span key="c">{invoice.containers}</span>,
                <span key="t" className="truncate">
                  {invoice.chargeTypes.join(", ") || "—"}
                </span>,
                <span key="r" className="truncate">
                  {invoice.responsibleParty ?? "—"}
                </span>,
                <span key="p">{invoice.paymentStatus ?? "—"}</span>,
              ])}
            />
          )}

          {tab === "credits" && (
            <Table
              headers={["Credit note", "Container", "Amount", "Company", "Reason", "Status"]}
              empty="No credit notes."
              rows={data.creditNotes.map((note) => [
                <span key="n" className="data">
                  {note.creditNoteNumber ?? (
                    <span className="text-[var(--color-warning)]">no number</span>
                  )}
                </span>,
                note.containerNumber ? (
                  <Link
                    key="c"
                    to={`/containers/${note.containerNumber}`}
                    className="data text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                  >
                    {formatContainerNumber(note.containerNumber)}
                  </Link>
                ) : (
                  <span key="c" className="text-[var(--color-warning)]">
                    unmatched
                  </span>
                ),
                <span key="a" className="data font-medium text-[var(--color-success)]">
                  {formatCurrency(note.amount)}
                </span>,
                <span key="co" className="truncate">
                  {note.company ?? "—"}
                </span>,
                <span key="r" className="truncate">
                  {note.reason ?? "—"}
                </span>,
                <span key="s">{note.status ?? "—"}</span>,
              ])}
            />
          )}

          {tab === "fbu" && (
            <Table
              headers={["Invoice", "Container", "Amount", "Trucker", "Charge type"]}
              empty="No FBU charges."
              rows={data.fbuCharges.map((charge) => [
                <span key="i" className="data">
                  {charge.invoiceNumber ?? "—"}
                </span>,
                charge.containerNumber ? (
                  <Link
                    key="c"
                    to={`/containers/${charge.containerNumber}`}
                    className="data text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                  >
                    {formatContainerNumber(charge.containerNumber)}
                  </Link>
                ) : (
                  <span key="c">—</span>
                ),
                <span key="a" className="data font-medium text-[var(--color-text-primary)]">
                  {formatCurrency(charge.amount)}
                </span>,
                <span key="t" className="truncate">
                  {charge.trucker ?? "—"}
                </span>,
                <span key="ct">{charge.chargeType ?? "—"}</span>,
              ])}
            />
          )}
        </div>
      </motion.section>

      <motion.p variants={rise} className="flex items-start gap-2 text-[0.72rem] text-[var(--color-text-secondary)]">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        Read-only log of what the source sheets contain. Invoice PDF parsing and
        the container-match review queue arrive with the document pipeline —
        nothing is charged, matched or approved from this screen.
      </motion.p>
    </motion.div>
  );
}

function Total({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "danger" | "success";
}) {
  return (
    <div className="card p-4">
      <div className="text-[0.64rem] tracking-wide text-[var(--color-text-secondary)] uppercase">
        {label}
      </div>
      <div
        className={clsx(
          "data mt-1.5 text-[1.35rem] leading-none font-bold",
          tone === "danger"
            ? "text-[var(--color-danger)]"
            : tone === "success"
              ? "text-[var(--color-success)]"
              : "text-[var(--color-text-primary)]",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[0.68rem] text-[var(--color-text-disabled)]">{hint}</div>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  total,
  onSelect,
  selected,
}: {
  title: string;
  rows: { name: string; meta: string; amount: number }[];
  total: number;
  onSelect?: (name: string) => void;
  selected?: string;
}) {
  return (
    <div className="card p-[var(--spacing-card)]">
      <h2 className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
        {title}
      </h2>
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.slice(0, 8).map((row) => {
          const share = total > 0 ? row.amount / total : 0;
          const isSelected = selected === row.name;
          return (
            <li key={row.name}>
              <button
                onClick={() => onSelect?.(row.name)}
                disabled={!onSelect}
                className={clsx(
                  "w-full text-left",
                  onSelect && "cursor-pointer",
                  isSelected && "font-semibold",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={clsx(
                      "truncate text-[0.78rem]",
                      isSelected
                        ? "text-[var(--color-primary)]"
                        : "text-[var(--color-text-primary)]",
                    )}
                  >
                    {row.name}
                  </span>
                  <span className="data shrink-0 text-[0.78rem] text-[var(--color-text-primary)]">
                    {formatCurrency(row.amount)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunk)]">
                  <div
                    className={clsx(
                      "h-full rounded-full",
                      isSelected ? "bg-[var(--color-primary)]" : "bg-[var(--color-accent)]",
                    )}
                    style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
                  />
                </div>
                <div className="mt-0.5 text-[0.66rem] text-[var(--color-text-disabled)]">
                  {row.meta} · {Math.round(share * 100)}%
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Table({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[0.85rem] text-[var(--color-text-secondary)]">
        {empty}
      </p>
    );
  }

  return (
    <table className="w-full border-separate border-spacing-0 text-left">
      <thead className="sticky top-0 z-10">
        <tr>
          {headers.map((header) => (
            <th
              key={header}
              className="border-b border-[var(--color-border)] bg-[var(--color-surface-sunk)] px-3 py-2 text-[0.64rem] font-semibold tracking-wider text-[var(--color-text-secondary)] uppercase"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, index) => (
          <tr
            key={index}
            className={clsx(
              "transition-colors hover:bg-[var(--color-accent-wash)]",
              index % 2 === 1 && "bg-[var(--color-surface-sunk)]/40",
            )}
          >
            {cells.map((cell, cellIndex) => (
              <td
                key={cellIndex}
                className="max-w-[220px] truncate border-b border-[var(--color-border)] px-3 py-2 text-[0.78rem] text-[var(--color-text-secondary)]"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="shimmer h-12 w-80 rounded-[var(--radius-sm)]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="shimmer h-[86px] rounded-[var(--radius)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="shimmer h-64 rounded-[var(--radius)]" />
        <div className="shimmer h-64 rounded-[var(--radius)]" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-danger-wash)] text-[var(--color-danger)]">
        <AlertTriangle size={24} aria-hidden />
      </span>
      <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
        Could not load the invoice log
      </p>
      <p className="max-w-md text-[var(--text-body)] text-[var(--color-text-secondary)]">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
      >
        Retry
      </button>
    </div>
  );
}

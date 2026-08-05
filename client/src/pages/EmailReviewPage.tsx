import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Info,
  Link2,
  MailQuestion,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import clsx from "clsx";
import { formatContainerNumber, formatRelative, isValidContainerNumber, normalizeContainerNumber } from "@tms/shared";
import {
  api,
  type AgentStatus,
  type EmailLogEntry,
  type EmailReviewQueue,
  type EmailRow,
  type ReviewItem,
} from "../services/api";

/**
 * Email match review (doc 05: "Never guess. If confidence is low, send to
 * Review Queue"; doc 09 §Human in the Loop).
 *
 * The matcher writes low-confidence links with needs_review set rather than
 * asserting them. Nothing here auto-approves — this screen is the human half
 * of that contract, and without it those links sit invisible forever.
 */

const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as const } },
};

export function EmailReviewPage() {
  const [queue, setQueue] = useState<EmailReviewQueue | null>(null);
  const [agents, setAgents] = useState<AgentStatus | null>(null);
  const [log, setLog] = useState<EmailLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editKey, setEditKey] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getEmailReview(), api.getAgentDevices(), api.getEmailLog(40)])
      .then(([q, a, l]) => {
        setQueue(q);
        setAgents(a);
        setLog(l.entries);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (work: () => Promise<unknown>, id: number, done: string) => {
    if (!editKey) {
      setNotice("Enter the edit key first — a match decision is a data change.");
      return;
    }
    setBusy(id);
    setNotice(null);
    try {
      await work();
      setNotice(done);
      load();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading && !queue) return <Skeleton />;
  if (error && !queue) return <ErrorState message={error} onRetry={load} />;
  if (!queue) return null;

  return (
    <motion.div initial="hidden" animate="show" className="flex flex-col gap-5">
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[var(--text-page-title)] font-bold text-[var(--color-text-primary)]">
            Email Review
          </h1>
          <p className="mt-1.5 text-[var(--text-body)] text-[var(--color-text-secondary)]">
            {queue.available
              ? `${queue.totals.lowConfidence} match${queue.totals.lowConfidence === 1 ? "" : "es"} to confirm · ${queue.totals.unmatched} unmatched`
              : "Waiting for a sync agent"}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[0.8rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-primary)] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} aria-hidden />
          Refresh
        </button>
      </motion.div>

      <AgentBanner agents={agents} />

      {!queue.available ? (
        <motion.div variants={rise} className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <MailQuestion size={26} className="text-[var(--color-text-secondary)]" aria-hidden />
          <p className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
            Nothing to review yet
          </p>
          <p className="max-w-lg text-[var(--text-body)] text-[var(--color-text-secondary)]">
            {queue.reason}
          </p>
        </motion.div>
      ) : (
        <>
          {/* The edit key gates every decision on this page, so it is asked
              for once here rather than per row. */}
          <motion.div
            variants={rise}
            className="card flex flex-wrap items-center gap-3 p-[var(--spacing-card)]"
          >
            <ShieldAlert size={16} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
            <label htmlFor="review-edit-key" className="text-[0.8rem] text-[var(--color-text-primary)]">
              Edit key
            </label>
            <input
              id="review-edit-key"
              type="password"
              inputMode="numeric"
              value={editKey}
              onChange={(event) => setEditKey(event.target.value)}
              placeholder="••••"
              className="w-28 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-center text-[0.85rem] tracking-[0.3em] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
            <span className="text-[0.72rem] text-[var(--color-text-secondary)]">
              Approving or rejecting a match writes to the container's history.
            </span>
            {notice && (
              <span className="ml-auto text-[0.76rem] font-medium text-[var(--color-accent)]">
                {notice}
              </span>
            )}
          </motion.div>

          <motion.section variants={rise} className="flex flex-col gap-3">
            <SectionHeading
              title="Matches to confirm"
              count={queue.totals.lowConfidence}
              hint="The matcher proposed these but is not confident enough to assert them."
            />
            {queue.lowConfidence.length === 0 ? (
              <EmptyRow text="No proposed matches are waiting." />
            ) : (
              queue.lowConfidence.map((item) => (
                <LowConfidenceCard
                  key={item.linkId}
                  item={item}
                  busy={busy === item.linkId}
                  onDecide={(decision) =>
                    act(
                      () => api.reviewEmailLink(item.linkId, decision, editKey),
                      item.linkId,
                      decision === "approve" ? "Match confirmed." : "Match rejected.",
                    )
                  }
                />
              ))
            )}
          </motion.section>

          <motion.section variants={rise} className="flex flex-col gap-3">
            <SectionHeading
              title="Unmatched emails"
              count={queue.totals.unmatched}
              hint="No container could be identified. Attach one by hand if you recognise it."
            />
            {queue.unmatched.length === 0 ? (
              <EmptyRow text="Every stored email is linked to a container." />
            ) : (
              queue.unmatched.map((email) => (
                <UnmatchedCard
                  key={email.id}
                  email={email}
                  busy={busy === email.id}
                  onLink={(containerNumber) =>
                    act(
                      () => api.linkEmailManually(email.id, containerNumber, editKey),
                      email.id,
                      `Linked to ${containerNumber}.`,
                    )
                  }
                />
              ))
            )}
          </motion.section>
        </>
      )}

      <ProcessingLog entries={log} />
    </motion.div>
  );
}

function AgentBanner({ agents }: { agents: AgentStatus | null }) {
  if (!agents?.available) return null;

  const enrolled = agents.devices.filter((d) => !d.revoked);
  const online = enrolled.filter((d) => d.online);

  // Presence is reported by the server from the agent's heartbeat. The
  // browser never probes localhost for it.
  return (
    <motion.div
      variants={rise}
      className={clsx(
        "card flex flex-wrap items-center gap-3 p-[var(--spacing-card)]",
        online.length === 0 && "border-[var(--color-warning)]",
      )}
    >
      <span
        className={clsx(
          "h-2.5 w-2.5 shrink-0 rounded-full",
          online.length > 0 ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]",
        )}
        aria-hidden
      />
      <span className="text-[0.82rem] font-medium text-[var(--color-text-primary)]">
        {online.length > 0
          ? `${online.length} sync agent${online.length === 1 ? "" : "s"} online`
          : enrolled.length > 0
            ? "No sync agent is reporting in"
            : "No sync agent enrolled"}
      </span>
      <span className="text-[0.74rem] text-[var(--color-text-secondary)]">
        {enrolled.length === 0
          ? "Email arrives from an agent on the PC where Outlook is signed in. Install it from Administration."
          : enrolled
              .map((d) => `${d.deviceName} (${d.operator})${d.lastSeenAt ? ` · seen ${formatRelative(d.lastSeenAt)}` : ""}`)
              .join(" · ")}
      </span>
    </motion.div>
  );
}

function SectionHeading({
  title,
  count,
  hint,
}: {
  title: string;
  count: number;
  hint: string;
}) {
  return (
    <div>
      <h2 className="flex items-baseline gap-2 text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
        {title}
        <span className="data text-[0.85rem] text-[var(--color-text-secondary)]">{count}</span>
      </h2>
      <p className="mt-0.5 text-[0.74rem] text-[var(--color-text-secondary)]">{hint}</p>
    </div>
  );
}

function EmailSummary({ email }: { email: EmailRow }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[0.84rem] font-medium text-[var(--color-text-primary)]">
        {email.subject ?? "(no subject)"}
      </p>
      {email.summary && (
        <p className="mt-0.5 truncate text-[0.74rem] text-[var(--color-text-secondary)]">
          {email.summary}
        </p>
      )}
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.68rem] text-[var(--color-text-disabled)]">
        <span className="rounded bg-[var(--color-primary-wash)] px-1.5 py-0.5 text-[var(--color-primary)]">
          {email.category}
        </span>
        <span>{email.senderName ?? email.senderAddress ?? "unknown sender"}</span>
        <span>{formatRelative(email.receivedAt)}</span>
      </p>
    </div>
  );
}

function LowConfidenceCard({
  item,
  busy,
  onDecide,
}: {
  item: ReviewItem;
  busy: boolean;
  onDecide: (decision: "approve" | "reject") => void;
}) {
  return (
    <div className="glass-solid flex flex-col gap-3 rounded-[var(--radius)] p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <EmailSummary email={item} />
        <div className="shrink-0 text-right">
          <div className="data text-[0.95rem] font-semibold text-[var(--color-text-primary)]">
            {formatContainerNumber(item.containerNumber)}
          </div>
          <div className="text-[0.66rem] text-[var(--color-text-secondary)]">
            {item.method} · {item.confidence !== null ? Math.round(item.confidence * 100) : "—"}%
          </div>
        </div>
      </div>

      {/* A checksum-valid number that is not in the fleet is a distinct case
          from a weak inference, and the operator needs to know which it is. */}
      {!item.containerExists && (
        <p className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--color-warning-wash)] px-3 py-2 text-[0.74rem] text-[var(--color-text-primary)]">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden />
          This container number is valid but is not in the fleet. Approving records
          a link to a container the TMS does not hold.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => onDecide("approve")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-[0.78rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          <Check size={13} aria-hidden />
          Confirm
        </button>
        <button
          onClick={() => onDecide("reject")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-[0.78rem] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-50"
        >
          <X size={13} aria-hidden />
          Reject
        </button>
        {item.containerExists && (
          <Link
            to={`/containers/${item.containerNumber}`}
            className="ml-auto text-[0.74rem] text-[var(--color-primary)] hover:underline"
          >
            Open container
          </Link>
        )}
      </div>
    </div>
  );
}

function UnmatchedCard({
  email,
  busy,
  onLink,
}: {
  email: EmailRow;
  busy: boolean;
  onLink: (containerNumber: string) => void;
}) {
  const [value, setValue] = useState("");

  // Validate before sending: the check digit catches a mistyped number here,
  // where it costs nothing, rather than creating a link to nothing.
  const normalized = useMemo(() => normalizeContainerNumber(value), [value]);
  const valid = normalized !== null && isValidContainerNumber(normalized);

  return (
    <div className="glass-solid flex flex-col gap-3 rounded-[var(--radius)] p-4 shadow-[var(--shadow-card)]">
      <EmailSummary email={email} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value.toUpperCase())}
          placeholder="Container number"
          className={clsx(
            "data w-48 rounded-[var(--radius-sm)] border bg-[var(--color-surface)] px-3 py-1.5 text-[0.8rem] text-[var(--color-text-primary)] outline-none",
            value && !valid
              ? "border-[var(--color-danger)]"
              : "border-[var(--color-border)] focus:border-[var(--color-primary)]",
          )}
        />
        <button
          onClick={() => normalized && onLink(normalized)}
          disabled={busy || !valid}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-[0.78rem] font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          <Link2 size={13} aria-hidden />
          Link
        </button>
        {value && !valid && (
          <span className="text-[0.72rem] text-[var(--color-danger)]">
            Not a valid container number — check the digits.
          </span>
        )}
      </div>
    </div>
  );
}

function ProcessingLog({ entries }: { entries: EmailLogEntry[] }) {
  return (
    <motion.section variants={rise} className="card p-[var(--spacing-card)]">
      <h2 className="text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
        Processing log
      </h2>
      <p className="mt-0.5 text-[0.74rem] text-[var(--color-text-secondary)]">
        Includes messages skipped as duplicates — without them there is no way to
        tell “the agent is running and nothing is new” from “the agent stopped”.
      </p>
      {entries.length === 0 ? (
        <p className="mt-3 text-[0.78rem] text-[var(--color-text-secondary)]">
          No processing activity recorded.
        </p>
      ) : (
        <ul className="mt-3 flex max-h-64 flex-col gap-1 overflow-auto">
          {entries.map((entry, index) => (
            <li key={index} className="flex items-baseline gap-2 text-[0.72rem]">
              <span className="w-16 shrink-0 text-[var(--color-text-disabled)]">
                {formatRelative(entry.at)}
              </span>
              <span
                className={clsx(
                  "w-20 shrink-0 font-medium",
                  entry.outcome === "linked"
                    ? "text-[var(--color-success)]"
                    : entry.outcome === "error"
                      ? "text-[var(--color-danger)]"
                      : "text-[var(--color-text-secondary)]",
                )}
              >
                {entry.outcome}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">
                {entry.detail ?? "—"}
              </span>
              {entry.device && (
                <span className="shrink-0 text-[var(--color-text-disabled)]">{entry.device}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] px-3.5 py-3 text-[0.78rem] text-[var(--color-text-secondary)]">
      <Info size={14} aria-hidden />
      {text}
    </p>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="shimmer h-12 w-72 rounded-[var(--radius-sm)]" />
      <div className="shimmer h-16 rounded-[var(--radius)]" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="shimmer h-28 rounded-[var(--radius)]" />
      ))}
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
        Could not load the review queue
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

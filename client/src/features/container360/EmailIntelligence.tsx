import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Info, MailWarning, Paperclip, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { formatRelative } from "@tms/shared";
import { api, type ContainerEmails, type EmailRow } from "../../services/api";

/**
 * Email Intelligence for one container (doc 04 §Email Intelligence,
 * doc 05 §Conversation Detection).
 *
 * When no sync agent has ever delivered mail, this says so and explains why
 * rather than rendering an empty list. "No emails" and "we cannot see your
 * mailbox" look identical on screen and mean completely different things —
 * the first would have an operator conclude the vendor never replied.
 */

const METHOD_LABEL: Record<string, string> = {
  "container-number": "Container number in the message",
  "booking-number": "Matched on booking number",
  "pickup-number": "Matched on pickup number",
  "conversation-thread": "Inferred from the conversation thread",
  manual: "Linked by an operator",
};

export function EmailIntelligence({ containerNumber }: { containerNumber: string }) {
  const [data, setData] = useState<ContainerEmails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .getContainerEmails(containerNumber)
      .then((result) => {
        if (!live) return;
        setData(result);
        setError(null);
      })
      .catch((err: Error) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [containerNumber]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="shimmer h-12 rounded-[var(--radius-sm)]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="flex items-center gap-2 text-[0.78rem] text-[var(--color-danger)]">
        <MailWarning size={14} aria-hidden />
        {error}
      </p>
    );
  }

  if (!data?.available) {
    return (
      <div className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border-strong)] px-3.5 py-3">
        <Info size={15} className="mt-0.5 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.78rem] text-[var(--color-text-primary)]">
            Not connected — reported rather than shown as “no emails”.
          </p>
          <p className="mt-1 text-[0.72rem] text-[var(--color-text-secondary)]">
            {data?.reason}
          </p>
        </div>
      </div>
    );
  }

  if (data.emails.length === 0) {
    return (
      <p className="text-[0.78rem] text-[var(--color-text-secondary)]">
        The mailbox is connected, but no correspondence has been matched to this
        container.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {data.categories.map((c) => (
          <span
            key={c.category}
            className="rounded-full bg-[var(--color-surface-sunk)] px-2.5 py-1 text-[0.68rem] text-[var(--color-text-secondary)]"
          >
            {c.category}{" "}
            <span className="data font-medium text-[var(--color-text-primary)]">{c.count}</span>
          </span>
        ))}
        {data.lastEmailAt && (
          <span className="text-[0.68rem] text-[var(--color-text-disabled)]">
            last {formatRelative(data.lastEmailAt)}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {data.emails.map((email) => (
          <EmailCard key={email.id} email={email} />
        ))}
      </ul>
    </div>
  );
}

function EmailCard({ email }: { email: EmailRow }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<EmailRow[] | null>(null);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // The thread is only worth fetching once, and only if asked for.
    if (next && !thread && email.conversationId) {
      api
        .getConversation(email.conversationId)
        .then((result) => setThread(result.emails))
        .catch(() => setThread([]));
    }
  };

  return (
    <li className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[0.8rem] font-medium text-[var(--color-text-primary)]">
              {email.subject ?? "(no subject)"}
            </span>
            {email.hasAttachments && (
              <Paperclip size={12} className="shrink-0 text-[var(--color-text-disabled)]" aria-hidden />
            )}
          </span>
          {email.summary && (
            <span className="mt-0.5 block truncate text-[0.72rem] text-[var(--color-text-secondary)]">
              {email.summary}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-[0.66rem] text-[var(--color-text-disabled)]">
            <span className="rounded bg-[var(--color-primary-wash)] px-1.5 py-0.5 text-[var(--color-primary)]">
              {email.category}
            </span>
            <span>{email.senderName ?? email.senderAddress ?? "unknown sender"}</span>
            <span>{formatRelative(email.receivedAt)}</span>
            {/* How this email came to be attached is part of the record.
                An operator must be able to tell a stated fact from an
                inference — see doc 05, "Never guess". */}
            {email.method && (
              <span
                className={clsx(
                  "flex items-center gap-1",
                  email.confidence !== null && email.confidence >= 0.9
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-warning)]",
                )}
                title={METHOD_LABEL[email.method] ?? email.method}
              >
                <ShieldCheck size={11} aria-hidden />
                {METHOD_LABEL[email.method] ?? email.method}
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          className={clsx(
            "mt-0.5 shrink-0 text-[var(--color-text-secondary)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[var(--color-border)]"
          >
            <div className="px-3 py-2.5">
              {!email.conversationId ? (
                <p className="text-[0.72rem] text-[var(--color-text-secondary)]">
                  This message is not part of a thread.
                </p>
              ) : thread === null ? (
                <div className="shimmer h-8 rounded-[var(--radius-sm)]" />
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {thread.map((message) => (
                    <li key={message.id} className="flex items-baseline gap-2">
                      <span className="shrink-0 text-[0.66rem] text-[var(--color-text-disabled)]">
                        {formatRelative(message.receivedAt)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.74rem] text-[var(--color-text-secondary)]">
                        <span className="text-[var(--color-text-primary)]">
                          {message.senderName ?? message.senderAddress ?? "—"}
                        </span>
                        {" · "}
                        {message.summary ?? message.subject ?? "(no content)"}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

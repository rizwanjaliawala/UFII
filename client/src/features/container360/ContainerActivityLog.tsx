import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { formatRelative } from "@tms/shared";
import { api, type ActivityEntry } from "../../services/api";

/**
 * Everything anyone has done to this container (doc 04 §Activity Log).
 *
 * Reads the append-only audit log, which already records the old and new
 * value of every change. Showing it here is what makes the edit gate
 * meaningful: a change nobody can see afterwards is not accountable, it is
 * just a change.
 */
export function ContainerActivityLog({ containerNumber }: { containerNumber: string }) {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let live = true;
    setEntries(null);
    api
      .getActivity({ entityKey: containerNumber, limit: 30 })
      .then((result) => {
        if (!live) return;
        setAvailable(result.available);
        setEntries(result.entries);
      })
      .catch(() => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [containerNumber]);

  if (entries === null) return <div className="shimmer h-16 rounded-[var(--radius-sm)]" />;

  if (!available) {
    return (
      <p className="text-[0.78rem] text-[var(--color-text-secondary)]">
        The audit trail needs the database. Not available in offline mode.
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="flex items-center gap-2 text-[0.78rem] text-[var(--color-text-secondary)]">
        <History size={14} aria-hidden />
        No changes recorded. Operational values come from the source sheets;
        only operator edits appear here.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {entries.map((entry, index) => (
        <li key={index} className="flex gap-2.5">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-[0.78rem] text-[var(--color-text-primary)]">
              <span className="font-medium">{entry.actor}</span> {entry.label}
              {entry.field && (
                <>
                  {" · "}
                  <span className="text-[var(--color-text-secondary)]">{entry.field}</span>
                </>
              )}
            </p>
            {/* Old and new together: "changed status" without the values is
                not an audit trail, it is a notification. */}
            {(entry.oldValue || entry.newValue) && (
              <p className="mt-0.5 text-[0.72rem] text-[var(--color-text-secondary)]">
                <span className="line-through opacity-70">{entry.oldValue ?? "empty"}</span>
                {" → "}
                <span className="text-[var(--color-text-primary)]">{entry.newValue ?? "empty"}</span>
              </p>
            )}
            {entry.reason && (
              <p className="mt-0.5 text-[0.72rem] italic text-[var(--color-text-secondary)]">
                “{entry.reason}”
              </p>
            )}
            <p className="mt-0.5 text-[0.66rem] text-[var(--color-text-disabled)]">
              {formatRelative(entry.at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

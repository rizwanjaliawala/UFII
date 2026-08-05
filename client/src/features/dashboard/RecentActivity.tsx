import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Info } from "lucide-react";
import { formatContainerNumber, formatRelative } from "@tms/shared";
import { api, type ActivityEntry } from "../../services/api";

/**
 * Recent Activity (doc 03 §Dashboard).
 *
 * A view over the append-only audit log, not a second record. Answers "what
 * has the team been doing" — which on a shared board is mostly a way to avoid
 * two dispatchers working the same container.
 */
export function RecentActivity() {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let live = true;
    api
      .getActivity({ limit: 12 })
      .then((result) => {
        if (!live) return;
        setAvailable(result.available);
        setEntries(result.entries);
      })
      .catch(() => live && setEntries([]));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="card p-[var(--spacing-card)]">
      <h2 className="flex items-center gap-2 text-[var(--text-card-title)] font-semibold text-[var(--color-text-primary)]">
        <Activity size={15} className="text-[var(--color-primary)]" aria-hidden />
        Recent activity
      </h2>

      {entries === null ? (
        <div className="mt-3 flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="shimmer h-8 rounded-[var(--radius-sm)]" />
          ))}
        </div>
      ) : !available ? (
        <p className="mt-2 flex items-start gap-2 text-[0.76rem] text-[var(--color-text-secondary)]">
          <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
          The audit trail needs the database — not available in offline mode.
        </p>
      ) : entries.length === 0 ? (
        <p className="mt-2 text-[0.76rem] text-[var(--color-text-secondary)]">
          Nothing yet. Operator edits and email-match decisions appear here;
          sheet values changing does not count as activity.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {entries.map((entry, index) => (
            <li key={index} className="flex items-baseline gap-2 text-[0.76rem]">
              <span className="shrink-0 text-[var(--color-text-disabled)]">
                {formatRelative(entry.at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">
                <span className="font-medium text-[var(--color-text-primary)]">{entry.actor}</span>{" "}
                {entry.label}{" "}
                {entry.entityType === "container" ? (
                  <Link
                    to={`/containers/${entry.entityKey}`}
                    className="data text-[var(--color-primary)] hover:underline"
                  >
                    {formatContainerNumber(entry.entityKey)}
                  </Link>
                ) : (
                  <span className="data">{entry.entityKey}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

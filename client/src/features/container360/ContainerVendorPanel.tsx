import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import clsx from "clsx";
import { formatCurrency, formatPercent, vendorKey } from "@tms/shared";
import { api, type VendorKpi } from "../../services/api";

/**
 * The hauling vendor's standing, shown inside Container 360 (doc 04
 * §Vendor Section).
 *
 * Answers the question an operator actually has while looking at a late
 * container: "is this vendor usually like this?" A score in isolation on the
 * Vendors page cannot answer that at the moment it matters.
 */
export function ContainerVendorPanel({ trucker }: { trucker: string | null }) {
  const [kpi, setKpi] = useState<VendorKpi | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!trucker) {
      setState("missing");
      return;
    }

    let live = true;
    const key = vendorKey(trucker);
    if (!key) {
      setState("missing");
      return;
    }

    setState("loading");
    api
      .getVendorDetail(key)
      .then((detail) => {
        if (!live) return;
        setKpi(detail.kpi);
        setState(detail.kpi ? "ready" : "missing");
      })
      .catch(() => live && setState("missing"));

    return () => {
      live = false;
    };
  }, [trucker]);

  if (!trucker) {
    return (
      <p className="text-[0.78rem] text-[var(--color-text-secondary)]">
        No trucker assigned to this container.
      </p>
    );
  }

  if (state === "loading") return <div className="shimmer h-20 rounded-[var(--radius-sm)]" />;

  if (state === "missing" || !kpi) {
    return (
      <p className="flex items-start gap-2 text-[0.78rem] text-[var(--color-text-secondary)]">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        {trucker} — no scorecard yet. A vendor needs completed moves before it
        can be scored.
      </p>
    );
  }

  const scoreTone =
    kpi.score === null
      ? "text-[var(--color-text-disabled)]"
      : kpi.score >= 80
        ? "text-[var(--color-success)]"
        : kpi.score >= 60
          ? "text-[var(--color-warning)]"
          : "text-[var(--color-danger)]";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[0.88rem] font-semibold text-[var(--color-text-primary)]">
            {kpi.name}
          </p>
          <p className="text-[0.72rem] text-[var(--color-text-secondary)]">
            {kpi.totalContainers.toLocaleString("en-US")} containers · {kpi.activeContainers} active
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className={clsx("data text-[1.3rem] leading-none font-bold", scoreTone)}>
            {kpi.score ?? "—"}
          </div>
          <div className="text-[0.6rem] tracking-wide text-[var(--color-text-secondary)] uppercase">
            Score
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Stat
          label="On-time"
          value={kpi.onTimePickupRate === null ? "—" : formatPercent(kpi.onTimePickupRate)}
        />
        <Stat label="At risk" value={String(kpi.atRisk)} tone={kpi.atRisk > 0 ? "danger" : undefined} />
        <Stat
          label="D&D borne"
          value={formatCurrency(kpi.ddCostResponsible)}
          tone={kpi.ddCostResponsible > 0 ? "danger" : undefined}
        />
      </dl>

      {kpi.score === null && (
        <p className="text-[0.7rem] text-[var(--color-text-disabled)]">
          Unscored — only {kpi.onTimeSample} completed moves, too few to judge fairly.
        </p>
      )}

      <Link
        to={`/containers?trucker=${encodeURIComponent(kpi.name)}`}
        className="text-[0.74rem] font-medium text-[var(--color-primary)] hover:underline"
      >
        See all {kpi.totalContainers.toLocaleString("en-US")} of their containers
      </Link>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div>
      <dt className="text-[0.6rem] tracking-wide text-[var(--color-text-secondary)] uppercase">
        {label}
      </dt>
      <dd
        className={clsx(
          "data mt-0.5 text-[0.9rem] font-semibold",
          tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

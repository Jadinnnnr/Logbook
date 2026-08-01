import { DatasetStatus, RefreshStatus, daysSince } from "@/lib/datastatus";
import { refreshData } from "@/lib/actions";

function ago(iso: string | null): string {
  const d = daysSince(iso);
  if (d === null) return "never built";
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

const STEP_MARK: Record<RefreshStatus["steps"][number]["state"], string> = {
  pending: "·",
  running: "⟳",
  done: "✓",
  error: "✕",
};

export default function DataFreshness({
  datasets,
  status,
  running,
  notice,
}: {
  datasets: DatasetStatus[];
  status: RefreshStatus | null;
  running: boolean;
  notice?: string;
}) {
  const stale = datasets.filter(
    (d) => d.present && (daysSince(d.builtAt) ?? 0) > d.staleAfterDays
  );
  const missing = datasets.filter((d) => !d.present);

  return (
    <div className="card data-freshness">
      <div className="freshness-head">
        <div>
          <h2 style={{ margin: 0 }}>Reference Data</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {running
              ? "Refreshing now — this takes a few minutes. Reload to see progress."
              : stale.length > 0
                ? `${stale.map((d) => d.label).join(" and ")} may be out of date.`
                : missing.length === datasets.length
                  ? "Nothing built yet."
                  : "Airport charts follow the FAA's 28-day cycle; the FARs and AIM are amended continuously."}
          </p>
        </div>
        <form action={refreshData}>
          <label className="freshness-opt" title="Adds a large download; only needed occasionally">
            <input type="checkbox" name="with_registry" />
            include aircraft registry
          </label>
          <button type="submit" disabled={running}>
            {running ? "Refreshing…" : "Refresh All Data"}
          </button>
        </form>
      </div>

      {notice && <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>{notice}</p>}

      <ul className="freshness-list">
        {datasets.map((d) => {
          const age = daysSince(d.builtAt);
          const isStale = d.present && age !== null && age > d.staleAfterDays;
          const step = status?.steps.find((s) => s.key === d.key);
          return (
            <li key={d.key}>
              <span
                className={`freshness-dot ${
                  !d.present ? "missing" : isStale || !d.builtAt ? "stale" : "fresh"
                }`}
                aria-hidden
              />
              <span className="freshness-label">{d.label}</span>
              <span className="freshness-detail">
                {!d.present
                  ? "not built"
                  : !d.builtAt
                    ? "built before dates were recorded — refresh to start tracking"
                    : `updated ${ago(d.builtAt)}${d.detail ? ` · ${d.detail}` : ""}`}
              </span>
              {step && running && (
                <span className="freshness-step">
                  {STEP_MARK[step.state]} {step.state}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {status && !running && status.state === "error" && (
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          The last refresh reported a problem:{" "}
          {status.steps.filter((s) => s.state === "error").map((s) => `${s.label} — ${s.message}`).join("; ")}
        </p>
      )}
    </div>
  );
}

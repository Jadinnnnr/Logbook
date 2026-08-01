import { requireUser } from "@/lib/auth";
import { flightsForUser } from "@/lib/db";
import { computeProficiency, ProficiencyState } from "@/lib/proficiency";

const STATE_META: Record<ProficiencyState, { label: string; icon: string; cssVar: string }> = {
  sharp: { label: "Sharp", icon: "✓", cssVar: "var(--status-good)" },
  fair: { label: "Fair", icon: "⚠", cssVar: "var(--status-warning)" },
  rusty: { label: "Rusty", icon: "✕", cssVar: "var(--status-critical)" },
};

function Meter({ score, state }: { score: number; state: ProficiencyState }) {
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      style={{ height: 10, borderRadius: 5, background: "var(--grid)", overflow: "hidden" }}
    >
      <div
        style={{
          width: `${score}%`,
          height: "100%",
          borderRadius: 5,
          background: STATE_META[state].cssVar,
        }}
      />
    </div>
  );
}

export default async function ProficiencyPage() {
  const user = await requireUser();
  const flights = flightsForUser(user.id);
  const report = computeProficiency(flights);
  const overallMeta = STATE_META[report.state];

  return (
    <main className="container">
      <h1>Estimated Proficiency</h1>

      {flights.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>Log some flights to see an estimate.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ maxWidth: 720 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
              <span className="hero-value">{report.overall}</span>
              <span className="currency-status" style={{ fontSize: 16 }}>
                <span aria-hidden style={{ color: overallMeta.cssVar }}>{overallMeta.icon}</span>
                {overallMeta.label}
              </span>
              <span className="muted">
                out of 100 ·{" "}
                {report.daysSinceLastFlight === null
                  ? "no flights yet"
                  : `last flight ${report.daysSinceLastFlight} days ago`}
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <Meter score={report.overall} state={report.state} />
            </div>
          </div>

          {report.metrics.map((m) => {
            const meta = STATE_META[m.state];
            return (
              <div className="card" key={m.key} style={{ maxWidth: 720 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, flex: 1 }}>{m.label}</h2>
                  {m.applicable ? (
                    <>
                      <span className="currency-status">
                        <span aria-hidden style={{ color: meta.cssVar }}>{meta.icon}</span>
                        {meta.label}
                      </span>
                      <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{m.score}/100</span>
                    </>
                  ) : (
                    <span className="muted">Not scored</span>
                  )}
                </div>
                {m.applicable && (
                  <div style={{ margin: "10px 0" }}>
                    <Meter score={m.score} state={m.state} />
                  </div>
                )}
                <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                  {m.applicable
                    ? m.detail
                    : `Not included in the overall score — no ${m.label.toLowerCase()} flying in your logbook.`}
                </p>
              </div>
            );
          })}

          <div className="card" style={{ maxWidth: 720 }}>
            <h2>How This Is Calculated</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Each area compares your recent activity to a modest &ldquo;staying sharp&rdquo; target:
              15 hours and 10 landings per 90 days, 6 approaches / 1 hold / 3 instrument hours per
              6 months (mirroring the 61.57(c) shape), and 3 night landings + 2 night hours per 90
              days. The overall score is a weighted average (recent time 30%, landings 25%,
              instrument 30%, night 15%); areas you never fly are excluded. This is a rough
              self-assessment aid — it is not a regulatory determination and no algorithm can
              replace your own judgment or a CFI&rsquo;s.
            </p>
          </div>
        </>
      )}
    </main>
  );
}

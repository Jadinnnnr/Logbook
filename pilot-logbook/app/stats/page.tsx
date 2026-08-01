import { requireUser } from "@/lib/auth";
import { flightsForUser } from "@/lib/db";
import { computeTotals, fmtHours } from "@/lib/currency";
import { RANGE_PRESETS, resolveRange, flightsInRange, hoursOverTime } from "@/lib/timerange";
import { HoursOverTimeChart, HoursByTypeChart, BreakdownBar } from "@/components/charts";

const BUCKET_LABEL = { day: "day", week: "week", month: "month", year: "year" } as const;

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const allFlights = flightsForUser(user.id);
  const range = resolveRange(params, allFlights);
  const flights = flightsInRange(allFlights, range);
  const totals = computeTotals(flights);
  const series = hoursOverTime(allFlights, range);

  const byType = new Map<string, number>();
  for (const f of flights) {
    const t = f.aircraft_type || "Unknown";
    byType.set(t, (byType.get(t) ?? 0) + f.total_time);
  }
  const sorted = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const topTypes = sorted.slice(0, 8).map(([label, value]) => ({ label, value }));
  const otherHours = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
  if (otherHours > 0) topTypes.push({ label: "Other", value: otherHours });

  const other = Math.max(0, totals.totalTime - totals.pic - totals.sic - totals.dualReceived);
  const role = [
    { label: "PIC", value: totals.pic },
    { label: "SIC", value: totals.sic },
    { label: "Dual Received", value: totals.dualReceived },
    ...(other > 0.05 ? [{ label: "Other", value: other }] : []),
  ];
  const conditions = [
    { label: "Day", value: Math.max(0, totals.totalTime - totals.night) },
    { label: "Night", value: totals.night },
  ];

  const spanText = range.from ? `${range.from} to ${range.to}` : `through ${range.to}`;

  return (
    <main className="container">
      <h1>Stats</h1>

      <div className="card">
        <div className="choice-row" role="group" aria-label="Time frame">
          {RANGE_PRESETS.map(([value, label]) => (
            <a
              key={value}
              href={value === "custom" ? "/stats?range=custom" : `/stats?range=${value}`}
              className={`range-chip${range.key === value ? " range-chip-active" : ""}`}
            >
              {label}
            </a>
          ))}
        </div>

        {range.key === "custom" && (
          <form method="get" action="/stats" className="range-form">
            <input type="hidden" name="range" value="custom" />
            <div className="field">
              <label htmlFor="from">From</label>
              <input id="from" name="from" type="date" defaultValue={range.from ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="to">To</label>
              <input id="to" name="to" type="date" defaultValue={range.to} />
            </div>
            <button type="submit">Apply</button>
          </form>
        )}

        <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
          {flights.length} flight{flights.length === 1 ? "" : "s"} ·{" "}
          {fmtHours(totals.totalTime)} hours · {spanText}
          {allFlights.length !== flights.length && ` · ${allFlights.length} in the full logbook`}
        </p>
      </div>

      {flights.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No flights in this range. Try a wider time frame.
          </p>
        </div>
      ) : (
        <>
          <div className="chart-card">
            <p className="chart-title">Hours Flown</p>
            <p className="chart-sub">
              Total time by {BUCKET_LABEL[range.bucket]} — {fmtHours(totals.totalTime)} hrs over{" "}
              {range.label.toLowerCase()}
            </p>
            <HoursOverTimeChart data={series} />
          </div>

          <div className="chart-card">
            <p className="chart-title">Hours by Aircraft Type</p>
            <p className="chart-sub">{range.label}</p>
            <HoursByTypeChart data={topTypes} />
          </div>

          <div className="chart-card">
            <p className="chart-title">Time by Role</p>
            <p className="chart-sub">Share of {fmtHours(totals.totalTime)} hours</p>
            <BreakdownBar segments={role} />
          </div>

          <div className="chart-card">
            <p className="chart-title">Day vs Night</p>
            <p className="chart-sub">Share of {fmtHours(totals.totalTime)} hours</p>
            <BreakdownBar segments={conditions} />
          </div>
        </>
      )}
    </main>
  );
}

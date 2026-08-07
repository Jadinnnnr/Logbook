import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { flightsForUser, aircraftForUser, Flight } from "@/lib/db";
import { resolveRoute, distanceNm } from "@/lib/airports";
import {
  evaluate,
  allRequirements,
  isMet,
  fraction,
  remaining,
  TRACKS,
  Track,
  Regime,
  Requirement,
} from "@/lib/certprogress";

function fmt(value: number, unit: string): string {
  if (unit === "hours") return value.toFixed(1);
  return String(Math.round(value));
}

function Row({ r }: { r: Requirement }) {
  const met = isMet(r);
  const untracked = r.confidence.kind === "notTracked";
  const cls = untracked ? "untracked" : met ? "met" : "short";
  const why =
    r.confidence.kind === "estimated"
      ? `Estimated — ${r.confidence.why}`
      : r.confidence.kind === "notTracked"
        ? `Not tracked — ${r.confidence.why}`
        : null;

  return (
    <div className="progress-row">
      <div className="progress-head">
        <span>{r.label}</span>
        <span className="num">
          {fmt(r.logged, r.unit)} / {fmt(r.required, r.unit)}
        </span>
      </div>
      <div className="progress-track">
        <div className={`progress-fill ${cls}`} style={{ width: `${fraction(r) * 100}%` }} />
      </div>
      <div className="progress-foot">
        <span>{r.reference}</span>
        <span>
          {untracked ? "not tracked" : met ? "met" : `${fmt(remaining(r), r.unit)} to go`}
        </span>
      </div>
      {why && <p className="progress-why">{why}</p>}
    </div>
  );
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string; regime?: string }>;
}) {
  const user = await requireUser();
  const { track: t = "commercial", regime: rg = "part61" } = await searchParams;
  const track = (TRACKS.some(([k]) => k === t) ? t : "commercial") as Track;
  const regime: Regime = rg === "part141" ? "part141" : "part61";

  const flights = flightsForUser(user.id);
  const aircraft = aircraftForUser(user.id);

  // The furthest point of the route from where it started. Not the summed leg
  // distance: the regulation asks for straight-line distance from the original
  // point of departure, which for a there-and-back is half the route.
  //
  // Resolving a route touches the bundled airport data, so it's only asked for
  // the handful of flights long enough to qualify — evaluate() calls this after
  // its cheap tests.
  const straightLineNm = (f: Flight): number | null => {
    const points = resolveRoute(f.from_airport, f.route, f.to_airport);
    if (points.length < 2) return null;
    const origin = points[0];
    return Math.max(...points.slice(1).map((p) => distanceNm(origin, p)));
  };

  const result = evaluate(track, regime, flights, aircraft, straightLineNm);
  const all = allRequirements(result);
  const metCount = all.filter(isMet).length;

  const href = (next: Partial<{ track: string; regime: string }>) => {
    const p = new URLSearchParams({ track, regime, ...next });
    return `/progress?${p.toString()}`;
  };

  return (
    <main className="container">
      <p className="crumb">
        <Link href="/">← Dashboard</Link>
      </p>
      <h1>Certificate progress</h1>

      <div className="card">
        <div className="chip-row">
          {TRACKS.map(([key, label]) => (
            <Link
              key={key}
              href={href({ track: key })}
              className={track === key ? "chip chip-on" : "chip"}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="chip-row" style={{ marginTop: 8 }}>
          <Link
            href={href({ regime: "part61" })}
            className={regime === "part61" ? "chip chip-on" : "chip"}
          >
            Part 61
          </Link>
          <Link
            href={href({ regime: "part141" })}
            className={regime === "part141" ? "chip chip-on" : "chip"}
          >
            Part 141
          </Link>
        </div>

        <p style={{ margin: "14px 0 0", fontWeight: 600 }}>
          {metCount} of {all.length} requirements look met
        </p>
        {result.unmatchedFlights > 0 && (
          <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
            ⚠ {result.unmatchedFlights} flight{result.unmatchedFlights === 1 ? "" : "s"} have no
            aircraft profile. Anything counted “in airplanes” is a floor until those tails are
            added under <Link href="/aircraft">Aircraft</Link>.
          </p>
        )}
      </div>

      {result.groups.map((g) => (
        <div className="card" key={g.title}>
          <h2 style={{ marginTop: 0 }}>{g.title}</h2>
          {g.requirements.map((r) => (
            <Row key={`${r.reference}-${r.label}`} r={r} />
          ))}
        </div>
      ))}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>What this can and can&rsquo;t tell you</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          These are totals from what you logged, not a finding that you meet the regulation. A
          logbook records hours and landings; the rules also ask about areas of operation, control
          towers, and what an instructor intended a flight to be. Rows marked{" "}
          <em>estimated</em> are counted through a stand-in, and the reason is printed under each.
          Rows marked <em>not tracked</em> can&rsquo;t be answered from this data at all and are
          never counted as met.
        </p>
        <p className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
          Check against your actual logbook and your instructor before applying.
        </p>
      </div>
    </main>
  );
}

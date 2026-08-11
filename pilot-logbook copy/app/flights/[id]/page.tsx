import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { aircraftByTail, flightById } from "@/lib/db";
import { categoryClassLabel } from "@/lib/aircraft";
import { resolveRoute, routeDistanceNm } from "@/lib/airports";
import { fmtHours } from "@/lib/currency";
import RouteMap from "@/components/RouteMap";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value" style={{ fontSize: 20 }}>{value}</div>
    </div>
  );
}

export default async function FlightDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const flight = flightById(user.id, Number(id));
  if (!flight) notFound();

  const profile = aircraftByTail(user.id).get(flight.tail_number.toUpperCase());
  const points = resolveRoute(flight.from_airport, flight.route, flight.to_airport);
  const distance = points.length > 1 ? routeDistanceNm(points) : null;

  const hourRows: [string, number][] = [
    ["Total time", flight.total_time],
    ["PIC", flight.pic],
    ["SIC", flight.sic],
    ["Dual received", flight.dual_received],
    ["Solo", flight.solo],
    ["Night", flight.night],
    ["Cross-country", flight.cross_country],
    ["Actual instrument", flight.actual_instrument],
    ["Simulated instrument", flight.simulated_instrument],
  ];

  return (
    <main className="container">
      <div className="page-actions">
        <h1 style={{ margin: 0, flex: 1 }}>
          {flight.date} — {[flight.from_airport, flight.to_airport].filter(Boolean).join(" → ") || "Local flight"}
        </h1>
        <Link href={`/flights/${flight.id}/edit`} className="btn btn-secondary">Edit</Link>
        <Link href="/flights" className="btn btn-secondary">All Flights</Link>
      </div>

      <div className="grid-tiles">
        <Stat label="Aircraft" value={`${flight.tail_number || "—"}${flight.aircraft_type ? ` (${flight.aircraft_type})` : ""}`} />
        {profile && <Stat label="Category / Class" value={categoryClassLabel(profile.category_class)} />}
        <Stat label="Total Time" value={fmtHours(flight.total_time)} />
        <Stat label="Landings" value={String(flight.day_landings + flight.night_landings)} />
        {flight.approaches > 0 && <Stat label="Approaches" value={String(flight.approaches)} />}
        {flight.holds > 0 && <Stat label="Holds" value={String(flight.holds)} />}
        {distance !== null && <Stat label="Route Distance" value={`${distance} nm`} />}
      </div>

      <div className="card">
        <h2>Route</h2>
        {points.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {points.map((p) => p.ident).join(" → ")}
              {flight.route && <> · filed: {flight.route}</>}
            </p>
            <RouteMap points={points} />
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
              Route waypoints resolve against FAA data: GPS fixes, VORs/NDBs, airports, and
              airways (V/J/T/Q) expand along their published sequence. SIDs/STARs and unknown
              tokens are skipped. US coverage only.
            </p>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No waypoints recognized — use ICAO identifiers (e.g. KPAO) in From/To, and fixes,
            VORs, or airways (e.g. SUNOL V334 SAC) in the Route field.
          </p>
        )}
      </div>

      <div className="card table-wrap" style={{ maxWidth: 560 }}>
        <h2>Hours</h2>
        <table>
          <tbody>
            {hourRows.filter(([, v]) => v > 0).map(([label, v]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num">{fmtHours(v)}</td>
              </tr>
            ))}
            <tr>
              <td>Landings (day / night / night full-stop)</td>
              <td className="num">
                {flight.day_landings} / {flight.night_landings} / {flight.night_full_stop_landings}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {flight.remarks && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h2>Remarks</h2>
          <p style={{ margin: 0 }}>{flight.remarks}</p>
        </div>
      )}
    </main>
  );
}

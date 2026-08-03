import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { flightsForUser } from "@/lib/db";
import { computeTotals, fmtHours } from "@/lib/currency";
import { deleteFlight } from "@/lib/actions";

const PER_PAGE = 15;

export default async function FlightsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; added?: string }>;
}) {
  const user = await requireUser();
  const allFlights = flightsForUser(user.id);
  const totals = computeTotals(allFlights);

  const params = await searchParams;
  const pageCount = Math.max(1, Math.ceil(allFlights.length / PER_PAGE));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pageCount);
  const start = (page - 1) * PER_PAGE;
  const flights = allFlights.slice(start, start + PER_PAGE);

  return (
    <main className="container">
      <h1>Flights</h1>
      {params.added && (
        <div className="notice">
          {params.added} wasn&rsquo;t in your fleet, so a profile was created for it. Fill in the
          rest on the <Link href="/aircraft">Aircraft page</Link> — the 61.31 flags in particular
          can&rsquo;t be looked up.
        </div>
      )}
      <div className="page-actions">
        <Link href="/flights/new" className="btn">+ Log Flight</Link>
        <span className="muted">
          {allFlights.length} flights, {fmtHours(totals.totalTime)} hours
          {pageCount > 1 && ` · showing ${start + 1}–${start + flights.length}`}
        </span>
      </div>
      {allFlights.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No flights yet. <Link href="/flights/new">Log your first flight</Link> or{" "}
            <Link href="/import-export">import a CSV</Link>.
          </p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Aircraft</th>
                <th>Route</th>
                <th className="num">Total</th>
                <th className="num">PIC</th>
                <th className="num">Night</th>
                <th className="num">XC</th>
                <th className="num">Inst</th>
                <th className="num">Ldg</th>
                <th className="num">Holds</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => (
                <tr key={f.id}>
                  <td><Link href={`/flights/${f.id}`}>{f.date}</Link></td>
                  <td>{f.tail_number} {f.aircraft_type && `(${f.aircraft_type})`}</td>
                  <td>{[f.from_airport, f.to_airport].filter(Boolean).join(" → ")}</td>
                  <td className="num">{fmtHours(f.total_time)}</td>
                  <td className="num">{fmtHours(f.pic)}</td>
                  <td className="num">{fmtHours(f.night)}</td>
                  <td className="num">{fmtHours(f.cross_country)}</td>
                  <td className="num">{fmtHours(f.actual_instrument + f.simulated_instrument)}</td>
                  <td className="num">{f.day_landings + f.night_landings}</td>
                  <td className="num">{f.holds || ""}</td>
                  <td>
                    <form action={deleteFlight} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="btn-danger" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
              <tr className="totals-row">
                <td colSpan={3}>Totals (all {allFlights.length} flights)</td>
                <td className="num">{fmtHours(totals.totalTime)}</td>
                <td className="num">{fmtHours(totals.pic)}</td>
                <td className="num">{fmtHours(totals.night)}</td>
                <td className="num">{fmtHours(totals.crossCountry)}</td>
                <td className="num">{fmtHours(totals.actualInstrument + totals.simulatedInstrument)}</td>
                <td className="num">{totals.dayLandings + totals.nightLandings}</td>
                <td className="num">{allFlights.reduce((s, f) => s + f.holds, 0) || ""}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="pager" aria-label="Flight pages">
          <a
            href={`/flights?page=${page - 1}`}
            className={`pager-step${page === 1 ? " pager-disabled" : ""}`}
            aria-disabled={page === 1}
          >
            ← Newer
          </a>
          <span className="pager-pages">
            {pageNumbers(page, pageCount).map((n, i) =>
              n === null ? (
                <span key={`gap-${i}`} className="pager-gap">…</span>
              ) : (
                <a
                  key={n}
                  href={`/flights?page=${n}`}
                  className={`pager-page${n === page ? " pager-current" : ""}`}
                  aria-current={n === page ? "page" : undefined}
                >
                  {n}
                </a>
              )
            )}
          </span>
          <a
            href={`/flights?page=${page + 1}`}
            className={`pager-step${page === pageCount ? " pager-disabled" : ""}`}
            aria-disabled={page === pageCount}
          >
            Older →
          </a>
        </nav>
      )}
    </main>
  );
}

/** First, last, and a window around the current page; null marks an ellipsis. */
function pageNumbers(page: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(total - 1, page + 1);
  if (lo > 2) out.push(null);
  for (let n = lo; n <= hi; n++) out.push(n);
  if (hi < total - 1) out.push(null);
  out.push(total);
  return out;
}

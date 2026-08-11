import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { searchAirports, airportDetail, airportDataAvailable, airportCount } from "@/lib/airportinfo";
import { fetchWeather } from "@/lib/weather";
import AirportPanel, { AirportResults } from "@/components/AirportPanel";
import WeatherPanel from "@/components/WeatherPanel";

export default async function AirportsPage({
  searchParams,
}: {
  searchParams: Promise<{ apt?: string; airport?: string }>;
}) {
  await requireUser();
  const { apt = "", airport: airportParam } = await searchParams;

  const haveAirportData = airportDataAvailable();
  const results = apt.trim() ? searchAirports(apt) : [];
  // A single hit is unambiguous — go straight to it rather than showing a
  // one-row result list.
  const chosen = airportParam ?? (results.length === 1 ? results[0].ident : undefined);
  const airport = chosen ? airportDetail(chosen) : null;
  // Only reach out to the network once an airport is actually selected.
  const weather = airport ? await fetchWeather(airport.ident) : null;

  return (
    <main className="container">
      <p className="crumb">
        <Link href="/resources">← Resources</Link>
      </p>
      <h1>Airport Lookup</h1>

      <div className="card">
        {!haveAirportData ? (
          <p className="muted" style={{ margin: 0 }}>
            Airport data hasn&rsquo;t been built. Use <strong>Refresh All Data</strong> on the{" "}
            <Link href="/resources">Resources</Link> page, or run{" "}
            <code>node scripts/build-airportdata.mjs</code>.
          </p>
        ) : (
          <>
            <form method="get" action="/resources/airports" className="ref-search">
              <div className="field">
                <label htmlFor="apt">Identifier, name, or city</label>
                <input
                  id="apt"
                  name="apt"
                  defaultValue={apt}
                  placeholder="KPAO, Palo Alto, Melbourne…"
                  autoComplete="off"
                />
              </div>
              <button type="submit">Search</button>
            </form>

            {!apt && !airport && (
              <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
                {airportCount().toLocaleString()} airports — runways, frequencies, services, current
                weather, the FAA airport diagram, and every published instrument approach.
              </p>
            )}

            {apt && !airportParam && results.length !== 1 && (
              <AirportResults results={results} query={apt} />
            )}

            {airport ? (
              <>
                <AirportPanel airport={airport} />
                {weather && <WeatherPanel weather={weather} ident={airport.ident} />}
                <p style={{ marginBottom: 0, marginTop: 16, fontSize: 13 }}>
                  <Link href={`/resources/performance?airport=${encodeURIComponent(airport.ident)}`}>
                    Run performance numbers for {airport.ident} →
                  </Link>
                </p>
              </>
            ) : (
              chosen && (
                <p className="muted" style={{ margin: "12px 0 0" }}>
                  No airport found for &ldquo;{chosen}&rdquo;.
                </p>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}

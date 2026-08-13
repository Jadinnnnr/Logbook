import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { airportDetail, airportDataAvailable, searchAirports } from "@/lib/airportinfo";
import { fetchWeather, relativeTime } from "@/lib/weather";
import { runwayHeadingFromIdent } from "@/lib/performance";
import PerformanceCalculator, { PerformanceSeed, RunwayOption } from "@/components/PerformanceCalculator";
import ClimbDescentCalculator from "@/components/ClimbDescentCalculator";
import CruiseCalculator from "@/components/CruiseCalculator";

const EMPTY: PerformanceSeed = {
  ident: null,
  name: null,
  elevationFt: null,
  runways: [],
  altimeterInHg: null,
  temperatureC: null,
  windDir: null,
  windSpeed: null,
  observed: null,
};

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ airport?: string }>;
}) {
  await requireUser();
  const { airport: query = "" } = await searchParams;

  let seed = EMPTY;
  let notFound = false;

  if (query.trim() && airportDataAvailable()) {
    // Accept an identifier directly, or fall back to the search index so
    // "Palo Alto" works the same way it does on the lookup page.
    const detail =
      airportDetail(query.trim()) ??
      (() => {
        const hits = searchAirports(query);
        return hits.length > 0 ? airportDetail(hits[0].ident) : null;
      })();

    if (!detail) {
      notFound = true;
    } else {
      const runways: RunwayOption[] = [];
      for (const r of detail.runways) {
        for (const [ident, heading] of [
          [r.le_ident, r.le_heading],
          [r.he_ident, r.he_heading],
        ] as [string, number | null][]) {
          if (!ident) continue;
          const h = heading ?? runwayHeadingFromIdent(ident);
          if (h === null) continue;
          runways.push({
            ident,
            heading: h,
            approx: heading === null,
            lengthFt: r.length_ft,
            surface: r.surface,
          });
        }
      }
      // By runway number, so the table reads the way the airport diagram does —
      // true headings would put 18L ahead of 17R at a field like KMCO.
      runways.sort(
        (a, b) => (parseInt(a.ident, 10) || 0) - (parseInt(b.ident, 10) || 0) || a.ident.localeCompare(b.ident)
      );

      const weather = await fetchWeather(detail.ident);
      const m = weather.metar;
      seed = {
        ident: detail.ident,
        name: detail.name,
        elevationFt: detail.elev_ft,
        runways,
        altimeterInHg: m?.altimeterInHg ?? null,
        temperatureC: m?.temperatureC ?? null,
        windDir: m?.windDir ?? null,
        windSpeed: m?.windSpeed ?? null,
        observed: m ? relativeTime(m.observedAt) : null,
      };
    }
  }

  return (
    <main className="container">
      <p className="crumb">
        <Link href="/resources">← Resources</Link>
      </p>
      <h1>Performance</h1>
      <p className="muted" style={{ marginTop: -12 }}>
        {seed.ident
          ? `${seed.ident} — ${seed.name}${seed.elevationFt !== null ? `, field elevation ${seed.elevationFt.toLocaleString()} ft` : ""}`
          : "Pick an airport to prefill elevation, runways, and the current weather — or just type the conditions in."}
      </p>

      <div className="card">
        <form method="get" action="/resources/performance" className="ref-search">
          <div className="field">
            <label htmlFor="airport">Airport</label>
            <input
              id="airport"
              name="airport"
              defaultValue={query}
              placeholder="KPAO, Palo Alto, Melbourne…"
              autoComplete="off"
            />
          </div>
          <button type="submit">Load</button>
        </form>
        {notFound && (
          <p className="muted" style={{ margin: "12px 0 0" }}>
            No airport found for &ldquo;{query}&rdquo;. You can still enter conditions by hand below.
          </p>
        )}
        {!airportDataAvailable() && (
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
            Airport data hasn&rsquo;t been built, so nothing can be prefilled. Use{" "}
            <strong>Refresh All Data</strong> on the <Link href="/resources">Resources</Link> page.
          </p>
        )}
      </div>

      <PerformanceCalculator seed={seed} section="conditions" />

      <ClimbDescentCalculator
        seed={{ elevationFt: seed.elevationFt, temperatureC: seed.temperatureC }}
      />

      <CruiseCalculator />

      <div className="card" style={{ maxWidth: 620 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Takeoff and landing distances moved to the{" "}
          <Link href="/resources/told">TOLD</Link> page, where the weight and balance card works
          out the takeoff weight the chart needs.
        </p>
      </div>

      <p className="muted" style={{ fontSize: 12, maxWidth: 760 }}>
        Pressure and density altitude are computed from the International Standard Atmosphere. The
        climb, descent and cruise figures come from the PA-28-181 POH and apply to that aircraft at
        2,550 lb and nothing else; every other distance on this site comes only from the numbers you
        copy out of your own AFM/POH. None of it replaces the book, and none of it is an official
        preflight briefing.
      </p>
    </main>
  );
}

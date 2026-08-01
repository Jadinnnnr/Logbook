import { requireUser } from "@/lib/auth";
import {
  searchReference,
  lookupCitation,
  referenceAvailable,
  referenceCounts,
  displayCitation,
  ReferenceHit,
} from "@/lib/reference";
import { searchAirports, airportDetail, airportDataAvailable, airportCount } from "@/lib/airportinfo";
import { fetchWeather } from "@/lib/weather";
import AirportPanel, { AirportResults } from "@/components/AirportPanel";
import WeatherPanel from "@/components/WeatherPanel";
import DataFreshness from "@/components/DataFreshness";
import { datasetStatuses, refreshStatus, refreshRunning } from "@/lib/datastatus";

const SOURCES: [string, string][] = [
  ["", "All"],
  ["FAR", "FARs"],
  ["AIM", "AIM"],
];

const EXAMPLES = ["61.57", "flight review", "class B entry", "VFR fuel reserves", "holding pattern"];

/** The snippet comes from FTS5 with <mark> around hits; render those safely. */
function Snippet({ html }: { html: string }) {
  const parts = html.split(/(<mark>|<\/mark>)/);
  let inMark = false;
  return (
    <p className="ref-snippet">
      {parts.map((part, i) => {
        if (part === "<mark>") {
          inMark = true;
          return null;
        }
        if (part === "</mark>") {
          inMark = false;
          return null;
        }
        return inMark ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function Result({ hit, expanded }: { hit: ReferenceHit; expanded: boolean }) {
  return (
    <div className="ref-result">
      <div className="ref-head">
        <span className="chip">{hit.source}</span>
        <span className="ref-citation">{displayCitation(hit)}</span>
        <span className="ref-title">{hit.title}</span>
        <span style={{ flex: 1 }} />
        <a href={hit.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
          Official text ↗
        </a>
      </div>
      {expanded ? (
        <p className="ref-body">{hit.body}</p>
      ) : (
        <>
          <Snippet html={hit.snippet} />
          <a
            href={`/resources?q=${encodeURIComponent(hit.citation)}&open=${encodeURIComponent(hit.citation)}#regs`}
            style={{ fontSize: 13 }}
          >
            Read the full text
          </a>
        </>
      )}
    </div>
  );
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    source?: string;
    open?: string;
    apt?: string;
    airport?: string;
    refresh?: string;
  }>;
}) {
  await requireUser();
  const { q = "", source = "", open, apt = "", airport: airportParam, refresh } = await searchParams;

  // --- Airport lookup ---
  const haveAirportData = airportDataAvailable();
  const aptResults = apt.trim() ? searchAirports(apt) : [];
  const chosen = airportParam ?? (aptResults.length === 1 ? aptResults[0].ident : undefined);
  const airport = chosen ? airportDetail(chosen) : null;
  // Only reach out to the network once an airport is actually selected.
  const weather = airport ? await fetchWeather(airport.ident) : null;

  // --- Regulations ---
  const available = referenceAvailable();
  const counts = referenceCounts();
  const exact = q.trim() ? lookupCitation(q) : null;
  const hits = q.trim() ? searchReference(q, source) : [];

  const datasets = datasetStatuses();

  return (
    <main className="container">
      <h1>Resources</h1>
      <p className="muted" style={{ marginTop: -12 }}>
        Flight planning and reference: look up any airport in the contiguous US with live weather,
        and search the FARs and AIM.
      </p>

      {/* ---------- Airport lookup ---------- */}
      <div className="card" id="airports">
        <h2>Airport Lookup</h2>
        {!haveAirportData ? (
          <p className="muted" style={{ margin: 0 }}>
            Airport data hasn&rsquo;t been built. Use <strong>Refresh All Data</strong> below, or run{" "}
            <code>node scripts/build-airportdata.mjs</code>.
          </p>
        ) : (
          <>
            <form method="get" action="/resources" className="ref-search">
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

            {apt && !airportParam && aptResults.length !== 1 && (
              <AirportResults results={aptResults} query={apt} />
            )}

            {airport ? (
              <>
                <AirportPanel airport={airport} />
                {weather && <WeatherPanel weather={weather} ident={airport.ident} />}
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

      {/* ---------- Regulations ---------- */}
      <div className="card" id="regs">
        <h2>FAR / AIM Search</h2>
        <form method="get" action="/resources" className="ref-search">
          <div className="field">
            <label htmlFor="q">Search the regulations</label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="61.57, night currency, class B entry…"
            />
          </div>
          <div className="field" style={{ flex: "none", minWidth: 140 }}>
            <label htmlFor="source">Source</label>
            <select id="source" name="source" defaultValue={source}>
              {SOURCES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <button type="submit">Search</button>
        </form>

        {!q && (
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
            {available
              ? `Searching ${counts.far} FAR sections and ${counts.aim} AIM paragraphs. Try `
              : "Reference database not built yet — use Refresh All Data below. Try "}
            {EXAMPLES.map((e, i) => (
              <span key={e}>
                {i > 0 && ", "}
                <a href={`/resources?q=${encodeURIComponent(e)}#regs`}>{e}</a>
              </span>
            ))}
            .
          </p>
        )}

        {q &&
          (!available ? (
            <p className="muted" style={{ margin: "14px 0 0" }}>
              The reference database hasn&rsquo;t been built. Run{" "}
              <code>node scripts/build-reference.mjs</code>, or use Refresh All Data below.
            </p>
          ) : exact === null && hits.length === 0 ? (
            <p className="muted" style={{ margin: "14px 0 0" }}>
              Nothing found for &ldquo;{q}&rdquo;. Try fewer or more general words.
            </p>
          ) : (
            <>
              <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>
                {exact ? "Exact citation, plus " : ""}
                {hits.length} result{hits.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
              </p>
              {exact && <Result hit={exact} expanded />}
              {hits
                .filter((h) => !exact || h.citation !== exact.citation)
                .map((h) => (
                  <Result key={`${h.source}-${h.citation}`} hit={h} expanded={open === h.citation} />
                ))}
            </>
          ))}
      </div>

      <DataFreshness
        datasets={datasets}
        status={refreshStatus()}
        running={refreshRunning()}
        notice={
          refresh === "started"
            ? "Refresh started. It runs in the background — reload this page to follow progress."
            : refresh === "already"
              ? "A refresh is already running."
              : undefined
        }
      />

      <p className="muted" style={{ fontSize: 12, maxWidth: 760 }}>
        Airport and regulatory data are local copies of US government works, only as current as the
        last refresh; weather is fetched live. Check the official source before relying on any of
        it, and get a proper preflight briefing.
      </p>
    </main>
  );
}

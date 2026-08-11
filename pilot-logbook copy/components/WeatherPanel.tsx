import { WeatherResult, FlightCategory, relativeTime, cloudLabel, tafLines } from "@/lib/weather";

const CATEGORY_TITLE: Record<FlightCategory, string> = {
  VFR: "Ceiling above 3,000 ft and visibility over 5 sm",
  MVFR: "Ceiling 1,000–3,000 ft or visibility 3–5 sm",
  IFR: "Ceiling 500–1,000 ft or visibility 1–3 sm",
  LIFR: "Ceiling below 500 ft or visibility under 1 sm",
  UNKNOWN: "Flight category not reported",
};

/**
 * Glue a phrase together so it can't be split across lines. These values sit in
 * a narrow column, and a wrap between a number and its unit — or between a
 * cloud cover and its altitude — reads as two separate facts.
 */
function noBreak(s: string): string {
  return s.replace(/ /g, " ");
}

function windText(m: NonNullable<WeatherResult["metar"]>): string {
  if (m.windSpeed === null) return "—";
  if (m.windSpeed === 0) return "Calm";
  const dir = m.windDir === null ? "variable" : `${String(m.windDir).padStart(3, "0")}°`;
  const gust = m.windGust ? ` ${noBreak(`gusting ${m.windGust} kt`)}` : "";
  return `${noBreak(`${dir} at ${m.windSpeed} kt`)}${gust}`;
}

function ceilingText(m: NonNullable<WeatherResult["metar"]>): string {
  if (m.clouds.length === 0) return "Sky clear";
  // The ceiling is the lowest broken or overcast layer.
  const ceiling = m.clouds.find((c) => ["BKN", "OVC", "OVX"].includes(c.cover.toUpperCase()));
  // Each layer holds together; the list breaks at the commas between them.
  const layers = m.clouds
    .map((c) =>
      noBreak(`${cloudLabel(c.cover)}${c.baseFtAgl !== null ? ` ${c.baseFtAgl.toLocaleString()} ft` : ""}`)
    )
    .join(", ");
  return ceiling?.baseFtAgl != null
    ? `${layers} · ${noBreak(`ceiling ${ceiling.baseFtAgl.toLocaleString()} ft`)}`
    : layers;
}

export default function WeatherPanel({ weather, ident }: { weather: WeatherResult; ident: string }) {
  const { metar, taf, error } = weather;

  if (error && !metar && !taf) {
    return (
      <section className="wx">
        <h4 className="airport-section">Weather</h4>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{error}</p>
      </section>
    );
  }

  const observed = relativeTime(metar?.observedAt ?? null);
  const stale = metar?.observedAt
    ? Date.now() - new Date(metar.observedAt).getTime() > 90 * 60000
    : false;

  return (
    <section className="wx">
      <div className="wx-head">
        <h4 className="airport-section" style={{ margin: 0 }}>Weather</h4>
        {metar && (
          <>
            <span className={`wx-cat wx-${metar.category.toLowerCase()}`} title={CATEGORY_TITLE[metar.category]}>
              {metar.category}
            </span>
            {observed && (
              <span className={`muted${stale ? " expiring" : ""}`} style={{ fontSize: 12 }}>
                observed {observed}
                {stale && " — unusually old, check the source"}
              </span>
            )}
          </>
        )}
        <span style={{ flex: 1 }} />
        <a
          href={`https://aviationweather.gov/data/metar/?ids=${encodeURIComponent(ident)}&taf=true`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 13 }}
        >
          Aviation Weather Center ↗
        </a>
      </div>

      {metar ? (
        <>
          <ul className="wx-facts">
            <li><span>Wind</span> {windText(metar)}</li>
            <li><span>Visibility</span> {metar.visibility ? `${metar.visibility} sm` : "—"}</li>
            <li><span>Sky</span> {ceilingText(metar)}</li>
            <li>
              <span>Temp / dewpoint</span>{" "}
              {metar.temperatureC !== null ? `${metar.temperatureC.toFixed(0)}°C` : "—"}
              {metar.dewpointC !== null ? ` / ${metar.dewpointC.toFixed(0)}°C` : ""}
            </li>
            <li>
              <span>Altimeter</span>{" "}
              {metar.altimeterInHg !== null ? `${metar.altimeterInHg.toFixed(2)} inHg` : "—"}
            </li>
          </ul>
          <pre className="wx-raw">{metar.raw}</pre>
        </>
      ) : (
        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
          No current METAR for {ident}.
        </p>
      )}

      <h4 className="airport-section" style={{ marginTop: 16 }}>
        Forecast (TAF)
        {taf?.issuedAt && (
          <span className="muted" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            {" "}— issued {relativeTime(taf.issuedAt)}
          </span>
        )}
      </h4>
      {taf ? (
        <pre className="wx-raw wx-taf">
          {tafLines(taf.raw).map((line, i) => (
            <span key={i} className={i === 0 ? "taf-head" : "taf-group"}>
              {line}
            </span>
          ))}
        </pre>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          No TAF published for {ident} — most non-towered fields don&rsquo;t get one.
        </p>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
        Live from the Aviation Weather Center, cached briefly. Decoded fields are a convenience —
        the raw text is authoritative, and this is not a substitute for an official preflight
        briefing.
      </p>
    </section>
  );
}

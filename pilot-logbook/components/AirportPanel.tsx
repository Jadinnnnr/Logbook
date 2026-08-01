import Link from "next/link";
import { AirportDetail, AirportSummary, fuelLabel, chartSupplementEdition } from "@/lib/airportinfo";
import RunwayDiagram from "./RunwayDiagram";

const SURFACE: Record<string, string> = {
  ASP: "Asphalt", CON: "Concrete", TURF: "Turf", GRS: "Grass", GRE: "Gravel",
  GVL: "Gravel", DIRT: "Dirt", WATER: "Water", SAND: "Sand", MATS: "Mats",
};

/** Frequency type codes ordered the way a pilot reads a chart supplement. */
const FREQ_ORDER = ["ATIS", "AWOS", "ASOS", "CTAF", "UNIC", "TWR", "GND", "CLD", "APP", "DEP", "A/D", "RDO", "OPS"];
const FREQ_LABEL: Record<string, string> = {
  ATIS: "ATIS", AWOS: "AWOS", ASOS: "ASOS", CTAF: "CTAF", UNIC: "UNICOM",
  TWR: "Tower", GND: "Ground", CLD: "Clearance", APP: "Approach",
  DEP: "Departure", "A/D": "Arrival/Departure", RDO: "Radio", OPS: "Operations",
};

function surfaceLabel(code: string): string {
  const key = (code || "").toUpperCase().replace(/[^A-Z]/g, "");
  return SURFACE[key] ?? code ?? "";
}

export function AirportResults({ results, query }: { results: AirportSummary[]; query: string }) {
  if (results.length === 0) {
    return (
      <p className="muted" style={{ margin: "12px 0 0" }}>
        No contiguous-US airport matches &ldquo;{query}&rdquo;.
      </p>
    );
  }
  return (
    <ul className="airport-results">
      {results.map((a) => (
        <li key={a.ident}>
          <Link href={`/resources?airport=${encodeURIComponent(a.ident)}#airports`}>
            <strong>{a.ident}</strong> {a.name}
            <span className="muted">
              {" "}
              — {a.city}
              {a.city && a.region ? ", " : ""}
              {a.region}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function AirportPanel({ airport }: { airport: AirportDetail }) {
  const freqs = [...airport.frequencies].sort((a, b) => {
    const ai = FREQ_ORDER.indexOf(a.type);
    const bi = FREQ_ORDER.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const fuels = (airport.fuel ?? "").split(",").map((f) => f.trim()).filter(Boolean);
  const edition = chartSupplementEdition();

  return (
    <div className="airport-detail">
      <div className="airport-head">
        <div>
          <h3 className="airport-name">
            {airport.ident} — {airport.name}
          </h3>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
            {[airport.city, airport.region].filter(Boolean).join(", ")}
            {airport.elev_ft !== null && ` · field elevation ${airport.elev_ft} ft`}
            {` · ${airport.lat.toFixed(4)}, ${airport.lon.toFixed(4)}`}
          </p>
        </div>
        {airport.diagram && (
          <a href={airport.diagram.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            FAA Airport Diagram ↗
          </a>
        )}
      </div>

      <div className="airport-grid">
        <section>
          <h4 className="airport-section">Runways</h4>
          {airport.runways.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>No runway data.</p>
          ) : (
            <table className="airport-table">
              <thead>
                <tr>
                  <th>Runway</th>
                  <th className="num">Length</th>
                  <th className="num">Width</th>
                  <th>Surface</th>
                </tr>
              </thead>
              <tbody>
                {airport.runways.map((r) => (
                  <tr key={`${r.le_ident}-${r.he_ident}`}>
                    <td>
                      {r.le_ident}/{r.he_ident}
                      {r.lighted ? <span className="chip" style={{ marginLeft: 6 }}>Lit</span> : null}
                    </td>
                    <td className="num">{r.length_ft ? `${r.length_ft.toLocaleString()} ft` : "—"}</td>
                    <td className="num">{r.width_ft ? `${r.width_ft} ft` : "—"}</td>
                    <td>{surfaceLabel(r.surface)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 12 }}>
            <RunwayDiagram runways={airport.runways} />
            {airport.runways.length > 0 && (
              <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
                Schematic — orientation and relative length only. Use the FAA diagram for taxi
                planning.
              </p>
            )}
          </div>
        </section>

        <section>
          <h4 className="airport-section">Frequencies</h4>
          {freqs.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>No frequency data.</p>
          ) : (
            <table className="airport-table">
              <tbody>
                {freqs.map((f, i) => (
                  <tr key={`${f.type}-${f.mhz}-${i}`}>
                    <td>{FREQ_LABEL[f.type] ?? f.type}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{f.description}</td>
                    <td className="num">{f.mhz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4 className="airport-section" style={{ marginTop: 18 }}>Services &amp; Fuel</h4>
          {fuels.length === 0 && !airport.airframe_repair ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>No services data.</p>
          ) : (
            <ul className="airport-plain">
              {fuels.length > 0 && (
                <li>
                  <strong>Fuel:</strong> {fuels.map(fuelLabel).join(", ")}
                </li>
              )}
              {airport.airframe_repair && (
                <li>
                  <strong>Airframe repair:</strong> {airport.airframe_repair.toLowerCase()}
                </li>
              )}
              {airport.powerplant_repair && (
                <li>
                  <strong>Powerplant repair:</strong> {airport.powerplant_repair.toLowerCase()}
                </li>
              )}
            </ul>
          )}
          <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Fuel and repair availability come from the FAA airport record — the same data printed
            in the Chart Supplement.{" "}
            {airport.csUrl ? (
              <>
                The{" "}
                <a href={airport.csUrl} target="_blank" rel="noopener noreferrer">
                  Chart Supplement {airport.cs_volume} volume
                </a>
                {edition && ` (effective ${edition})`} carries this airport&rsquo;s full entry,
                including the FBOs and services listed for the field.
              </>
            ) : (
              <>
                The{" "}
                <a
                  href="https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dafd/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  FAA Chart Supplement
                </a>{" "}
                carries the full airport entry, including FBOs and services.
              </>
            )}
          </p>
        </section>
      </div>

      <section style={{ marginTop: 4 }}>
        <h4 className="airport-section">
          Instrument Approaches{airport.approaches.length > 0 && ` (${airport.approaches.length})`}
        </h4>
        {airport.approaches.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            No published instrument approaches.
          </p>
        ) : (
          <ul className="approach-list">
            {airport.approaches.map((c) => (
              <li key={c.url}>
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.name} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

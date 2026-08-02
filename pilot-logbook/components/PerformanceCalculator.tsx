"use client";

import { useMemo, useState } from "react";
import {
  pressureAltitude,
  isaTempC,
  densityAltitude,
  windComponents,
  interpolatePoh,
  applyCorrections,
  PohCorners,
} from "@/lib/performance";
import {
  evaluateChart,
  chart,
  CHART_ORDER,
  AIRCRAFT_LABEL,
  SOURCE_LABEL,
} from "@/lib/pohcharts";

export interface RunwayOption {
  ident: string;
  /** True heading where the FAA publishes one, otherwise the runway number. */
  heading: number;
  /** Set when the heading is only the runway number rounded to 10°. */
  approx: boolean;
  lengthFt: number | null;
  surface: string;
}

export interface PerformanceSeed {
  ident: string | null;
  name: string | null;
  elevationFt: number | null;
  runways: RunwayOption[];
  /** From the current METAR, when one was available. */
  altimeterInHg: number | null;
  temperatureC: number | null;
  windDir: number | null;
  windSpeed: number | null;
  observed: string | null;
}

const CORRECTIONS = [
  { key: "surface", label: "Dry grass / soft field", hint: "Your AFM's note, e.g. +15%" },
  { key: "slope", label: "Runway slope", hint: "e.g. +10% per 1% up" },
  { key: "other", label: "Other AFM correction", hint: "Anything else the book calls for" },
] as const;

type CorrectionKey = (typeof CORRECTIONS)[number]["key"];

function num(v: string): number {
  return v.trim() === "" ? NaN : Number(v);
}

function ft(v: number): string {
  return `${Math.round(v).toLocaleString()} ft`;
}

function signed(v: number, unit: string, decimals = 1): string {
  const r = Number(v.toFixed(decimals));
  return `${r > 0 ? "+" : ""}${r.toLocaleString()} ${unit}`;
}

export default function PerformanceCalculator({ seed }: { seed: PerformanceSeed }) {
  const [elev, setElev] = useState(seed.elevationFt !== null ? String(seed.elevationFt) : "");
  const [altim, setAltim] = useState(
    seed.altimeterInHg !== null ? seed.altimeterInHg.toFixed(2) : "29.92"
  );
  const [oat, setOat] = useState(seed.temperatureC !== null ? String(Math.round(seed.temperatureC)) : "");
  const [windDir, setWindDir] = useState(seed.windDir !== null ? String(seed.windDir) : "");
  const [windSpeed, setWindSpeed] = useState(seed.windSpeed !== null ? String(seed.windSpeed) : "");
  const [maxCross, setMaxCross] = useState("");

  const [poh, setPoh] = useState<Record<keyof PohCorners, string>>({
    paLow: "",
    paHigh: "",
    tempLow: "",
    tempHigh: "",
    lowLow: "",
    lowHigh: "",
    highLow: "",
    highHigh: "",
  });
  const [corrections, setCorrections] = useState<Record<CorrectionKey, string>>({
    surface: "",
    slope: "",
    other: "",
  });
  // The Archer charts are the common case here, so they are on by default.
  const [usePoh, setUsePoh] = useState(true);
  const [grossWeight, setGrossWeight] = useState("");
  const [headwind, setHeadwind] = useState("");
  const [pohPa, setPohPa] = useState("");
  const [pohOat, setPohOat] = useState("");
  /** "" means whichever runway is most into wind. */
  const [pohRunway, setPohRunway] = useState("");

  const atmosphere = useMemo(() => {
    const e = num(elev);
    const a = num(altim);
    const t = num(oat);
    if (!Number.isFinite(e) || !Number.isFinite(a)) return null;
    const pa = pressureAltitude(e, a);
    const isa = isaTempC(pa);
    if (!Number.isFinite(t)) return { pa, isa, da: null, dev: null };
    return { pa, isa, da: densityAltitude(pa, t), dev: t - isa };
  }, [elev, altim, oat]);

  const winds = useMemo(() => {
    const d = num(windDir);
    const s = num(windSpeed);
    if (!Number.isFinite(d) || !Number.isFinite(s) || seed.runways.length === 0) return null;
    const limit = num(maxCross);
    return seed.runways.map((r) => {
      const c = windComponents(r.heading, d, s);
      return {
        runway: r,
        ...c,
        overLimit: Number.isFinite(limit) && c.crosswind > limit,
      };
    });
  }, [windDir, windSpeed, maxCross, seed.runways]);

  const interpolation = useMemo(() => {
    if (!atmosphere) return null;
    const t = num(oat);
    if (!Number.isFinite(t)) return null;
    const entered = Object.values(poh).some((v) => v.trim() !== "");
    if (!entered) return null;
    const corners: PohCorners = {
      paLow: num(poh.paLow),
      paHigh: num(poh.paHigh),
      tempLow: num(poh.tempLow),
      tempHigh: num(poh.tempHigh),
      lowLow: num(poh.lowLow),
      lowHigh: num(poh.lowHigh),
      highLow: num(poh.highLow),
      highHigh: num(poh.highHigh),
    };
    const result = interpolatePoh(corners, atmosphere.pa, t);
    if (!result.ok) return result;
    const percents = CORRECTIONS.map((c) => num(corrections[c.key])).filter(Number.isFinite);
    return { ...result, corrected: applyCorrections(result.distance, percents), percents };
  }, [poh, corrections, atmosphere, oat]);

  const setPohField = (k: keyof PohCorners, v: string) => setPoh((p) => ({ ...p, [k]: v }));

  // The runway that gives the most headwind — the one you would actually use,
  // and so the sensible default for the chart's wind panel.
  const bestRunway = useMemo(() => {
    if (!winds || winds.length === 0) return null;
    return winds.reduce((a, b) => (b.headwind > a.headwind ? b : a));
  }, [winds]);

  /** The runway the numbers are for: the chosen one, else the most into wind. */
  const pohRunwayWind = useMemo(() => {
    if (!winds || winds.length === 0) return null;
    if (!pohRunway) return bestRunway;
    return winds.find((w) => w.runway.ident === pohRunway) ?? bestRunway;
  }, [winds, pohRunway, bestRunway]);

  // Each field falls back to the live conditions above when left blank.
  const pohPaValue = pohPa.trim() !== "" ? num(pohPa) : atmosphere ? atmosphere.pa : NaN;
  const pohPaFromConditions = pohPa.trim() === "" && Number.isFinite(pohPaValue);
  const pohOatValue = pohOat.trim() !== "" ? num(pohOat) : num(oat);
  const pohOatFromConditions = pohOat.trim() === "" && Number.isFinite(pohOatValue);
  const pohHeadwind = headwind.trim() !== "" ? num(headwind) : pohRunwayWind ? pohRunwayWind.headwind : NaN;
  const pohHeadwindFromRunway = headwind.trim() === "" && pohRunwayWind !== null;

  const pohResults = useMemo(() => {
    if (!usePoh) return null;
    const w = num(grossWeight);
    if (!Number.isFinite(pohPaValue)) return { blocked: "Enter a pressure altitude, or a field elevation and altimeter setting in Conditions." };
    if (!Number.isFinite(pohOatValue)) return { blocked: "Enter a temperature, here or in Conditions." };
    if (!Number.isFinite(w)) return { blocked: "Enter a gross weight." };
    if (!Number.isFinite(pohHeadwind)) return { blocked: "Enter a headwind component, or pick an airport with runways." };
    const percents = CORRECTIONS.map((c) => num(corrections[c.key])).filter(Number.isFinite);
    return {
      rows: CHART_ORDER.map((id) => {
        const r = evaluateChart(id, {
          pressureAltFt: pohPaValue,
          oatC: pohOatValue,
          weightLb: w,
          headwindKt: pohHeadwind,
        });
        return { id, meta: chart(id), r, percents };
      }),
    };
  }, [usePoh, pohPaValue, pohOatValue, grossWeight, pohHeadwind, corrections]);

  // The longest runway is the yardstick for the manual "will it fit" comparison.
  const longest = seed.runways.reduce<number | null>(
    (m, r) => (r.lengthFt !== null && (m === null || r.lengthFt > m) ? r.lengthFt : m),
    null
  );
  // The POH block measures against the runway actually chosen instead.
  const pohRunwayLength = pohRunwayWind?.runway.lengthFt ?? longest;

  return (
    <>
      <div className="card">
        <h2>Conditions</h2>
        {seed.observed && (
          <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
            Altimeter, temperature, and wind prefilled from the {seed.ident} METAR observed{" "}
            {seed.observed}. Change anything you like — nothing here is sent anywhere.
          </p>
        )}
        <div className="perf-inputs">
          <div className="field">
            <label htmlFor="elev">Field elevation (ft)</label>
            <input id="elev" inputMode="numeric" value={elev} onChange={(e) => setElev(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="altim">Altimeter (inHg)</label>
            <input id="altim" inputMode="decimal" value={altim} onChange={(e) => setAltim(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="oat">Temperature (°C)</label>
            <input id="oat" inputMode="numeric" value={oat} onChange={(e) => setOat(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="wdir">Wind from (°)</label>
            <input id="wdir" inputMode="numeric" value={windDir} onChange={(e) => setWindDir(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="wspd">Wind speed (kt)</label>
            <input id="wspd" inputMode="numeric" value={windSpeed} onChange={(e) => setWindSpeed(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="xw">Max demonstrated crosswind (kt)</label>
            <input id="xw" inputMode="numeric" value={maxCross} onChange={(e) => setMaxCross(e.target.value)} placeholder="optional" />
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Atmosphere</h2>
        {atmosphere ? (
          <>
            <div className="perf-results">
              <div className="perf-result">
                <span className="perf-result-label">Pressure Altitude</span>
                <span className="perf-result-value">{ft(atmosphere.pa)}</span>
              </div>
              <div className="perf-result">
                <span className="perf-result-label">ISA Temperature</span>
                <span className="perf-result-value">{Math.round(atmosphere.isa)} °C</span>
              </div>
              <div className="perf-result">
                <span className="perf-result-label">ISA Deviation</span>
                <span className="perf-result-value">
                  {atmosphere.dev === null ? "—" : signed(atmosphere.dev, "°C")}
                </span>
              </div>
              <div className="perf-result">
                <span className="perf-result-label">Density Altitude</span>
                <span className="perf-result-value perf-headline">
                  {atmosphere.da === null ? "—" : ft(atmosphere.da)}
                </span>
                {atmosphere.da !== null && (
                  <span className="perf-result-sub">
                    {signed(atmosphere.da - atmosphere.pa, "ft", 0)} vs pressure altitude
                  </span>
                )}
              </div>
            </div>
            {atmosphere.da === null && (
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
                Enter a temperature for density altitude.
              </p>
            )}
          </>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Enter a field elevation and altimeter setting.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Wind Components</h2>
        {seed.runways.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Pick an airport with published runways to see per-runway components.
          </p>
        ) : !winds ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Enter a wind direction and speed.
          </p>
        ) : (
          <>
            <table className="perf-table">
              <thead>
                <tr>
                  <th scope="col">Runway</th>
                  <th scope="col">Length</th>
                  <th scope="col">Wind angle</th>
                  <th scope="col">Head / tail</th>
                  <th scope="col">Crosswind</th>
                </tr>
              </thead>
              <tbody>
                {winds.map((w) => (
                  <tr key={w.runway.ident} className={w.overLimit ? "perf-row-warn" : undefined}>
                    <th scope="row">
                      {w.runway.ident}
                      {w.runway.approx && <span className="muted" title="Heading taken from the runway number — no published heading in the FAA data"> ≈</span>}
                    </th>
                    <td>{w.runway.lengthFt ? w.runway.lengthFt.toLocaleString() : "—"}</td>
                    <td>{Math.round(w.angle)}°</td>
                    <td>
                      {w.headwind >= 0
                        ? `${Math.round(w.headwind)} kt head`
                        : `${Math.abs(Math.round(w.headwind))} kt TAIL`}
                    </td>
                    <td>
                      {Math.round(w.crosswind)} kt
                      {/* Below half a knot the side is noise, not information. */}
                      {Math.round(w.crosswind) > 0 && w.from !== "none" && ` from the ${w.from}`}
                      {w.overLimit && " — over your limit"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ marginBottom: 0, fontSize: 12 }}>
              Runway headings are the FAA&rsquo;s published <em>true</em> headings, which is also
              what a METAR wind is referenced to — so the prefilled numbers agree. Tower and ATIS
              winds are magnetic; if you type one of those in, convert it or expect an error the
              size of the local variation. A <span aria-hidden>≈</span> marks a runway whose heading
              was taken from its number.
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2>Takeoff / Landing Distance</h2>

        <label className="perf-toggle">
          <input type="checkbox" checked={usePoh} onChange={(e) => setUsePoh(e.target.checked)} />
          <span>
            <strong>Use the {AIRCRAFT_LABEL} POH charts</strong>
            <span className="muted"> — figures 5-7, 5-11, 5-41 and 5-43, traced from the book</span>
          </span>
        </label>

        {usePoh ? (
          <>
            <div className="perf-inputs" style={{ marginTop: 14 }}>
              <div className="field">
                <label htmlFor="poh-pa">Pressure altitude (ft)</label>
                <input
                  id="poh-pa"
                  inputMode="numeric"
                  value={pohPa}
                  onChange={(e) => setPohPa(e.target.value)}
                  placeholder={atmosphere ? `${Math.round(atmosphere.pa).toLocaleString()} from Conditions` : "required"}
                />
              </div>
              <div className="field">
                <label htmlFor="poh-oat">Temperature (°C)</label>
                <input
                  id="poh-oat"
                  inputMode="numeric"
                  value={pohOat}
                  onChange={(e) => setPohOat(e.target.value)}
                  placeholder={oat.trim() !== "" ? `${oat} from the METAR` : "required"}
                />
              </div>
              <div className="field">
                <label htmlFor="gw">Gross weight (lb)</label>
                <input id="gw" inputMode="numeric" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} placeholder="max 2,550" />
              </div>
              {seed.runways.length > 0 && (
                <div className="field">
                  <label htmlFor="poh-rwy">Runway</label>
                  <select id="poh-rwy" value={pohRunway} onChange={(e) => setPohRunway(e.target.value)}>
                    <option value="">
                      {bestRunway ? `Most into wind — ${bestRunway.runway.ident}` : "Most into wind"}
                    </option>
                    {seed.runways.map((r) => (
                      <option key={r.ident} value={r.ident}>
                        {r.ident}
                        {r.lengthFt ? ` — ${r.lengthFt.toLocaleString()} ft` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="hw">Headwind component (kt)</label>
                <input
                  id="hw"
                  inputMode="numeric"
                  value={headwind}
                  onChange={(e) => setHeadwind(e.target.value)}
                  placeholder={
                    pohRunwayWind ? `${Math.round(pohRunwayWind.headwind)} on ${pohRunwayWind.runway.ident}` : "0"
                  }
                />
              </div>
            </div>
            {(pohPaFromConditions || pohOatFromConditions || pohHeadwindFromRunway) && (
              <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
                {pohPaFromConditions && `Using ${Math.round(pohPaValue).toLocaleString()} ft pressure altitude from Conditions above. `}
                {pohOatFromConditions && `Using ${Math.round(pohOatValue)} °C from Conditions above. `}
                {pohHeadwindFromRunway && (
                  <>
                    Using {Math.round(pohRunwayWind!.headwind)} kt — the component on runway{" "}
                    {pohRunwayWind!.runway.ident}
                    {!pohRunway && ", the most into wind"}.
                    {pohRunwayWind!.headwind < 0 && " That is a tailwind, which the charts don't cover."}
                  </>
                )}
                {" "}Type a value to override.
              </p>
            )}

            {pohResults && "blocked" in pohResults ? (
              <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>{pohResults.blocked}</p>
            ) : pohResults ? (
              <>
                <div className="perf-results" style={{ marginTop: 16 }}>
                  {pohResults.rows.map(({ id, meta, r, percents }) => (
                    <div className="perf-result" key={id}>
                      <span className="perf-result-label">{meta.title}</span>
                      {r.ok ? (
                        <>
                          <span className="perf-result-value perf-headline">
                            {ft(applyCorrections(r.distance, percents))}
                          </span>
                          <span className="perf-result-sub">
                            {percents.length > 0 && `${ft(r.distance)} from the chart, ${percents.map((p) => signed(p, "%")).join(", ")} applied · `}
                            figure {meta.figure}
                            {/* Measured against the runway actually chosen, not
                                the longest one on the field. */}
                            {pohRunwayLength !== null &&
                              ` · ${ft(pohRunwayLength - applyCorrections(r.distance, percents))} to spare${pohRunwayWind ? ` on ${pohRunwayWind.runway.ident}` : ""}`}
                          </span>
                        </>
                      ) : (
                        <span className="perf-result-sub" style={{ fontSize: 13 }}>{r.reason}</span>
                      )}
                    </div>
                  ))}
                </div>
                <h3 className="airport-section" style={{ marginTop: 18 }}>Corrections from your AFM (%)</h3>
                <div className="perf-inputs">
                  {CORRECTIONS.map((c) => (
                    <div className="field" key={c.key}>
                      <label htmlFor={`pohcorr-${c.key}`}>{c.label}</label>
                      <input
                        id={`pohcorr-${c.key}`}
                        inputMode="numeric"
                        placeholder={c.hint}
                        value={corrections[c.key]}
                        onChange={(e) => setCorrections((p) => ({ ...p, [c.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <p className="muted" style={{ margin: "12px 0 0", fontSize: 12 }}>
                  Read off the charts in {SOURCE_LABEL}. The takeoff figures are <strong>flaps
                  up</strong>; the landing figures assume a power-off approach at 66 KIAS with 40°
                  flaps, full-stall touchdown and maximum braking. Both assume a paved, level, dry
                  runway and full throttle before brake release. These are traced curves, accurate
                  to a percent or two against each figure&rsquo;s own worked example — close enough
                  to plan with, not a reason to skip the book, and they carry no safety factor.
                </p>
              </>
            ) : null}
          </>
        ) : (
        <>
        <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          For any other aeroplane this app has no performance data and will not invent any. Copy the
          four numbers from your AFM/POH chart that bracket today&rsquo;s pressure altitude and
          temperature, and it does the interpolation — the arithmetic that is easy to get wrong in
          the run-up area.
        </p>

        <div className="perf-poh">
          <div className="perf-axis">
            <div className="field">
              <label htmlFor="tempLow">Lower temp (°C)</label>
              <input id="tempLow" inputMode="numeric" value={poh.tempLow} onChange={(e) => setPohField("tempLow", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tempHigh">Upper temp (°C)</label>
              <input id="tempHigh" inputMode="numeric" value={poh.tempHigh} onChange={(e) => setPohField("tempHigh", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="paLow">Lower press. alt (ft)</label>
              <input id="paLow" inputMode="numeric" value={poh.paLow} onChange={(e) => setPohField("paLow", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="paHigh">Upper press. alt (ft)</label>
              <input id="paHigh" inputMode="numeric" value={poh.paHigh} onChange={(e) => setPohField("paHigh", e.target.value)} />
            </div>
          </div>

          <table className="perf-table perf-grid">
            <caption>Distance from the chart (ft)</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Pressure altitude</span>
                </th>
                <th scope="col">{poh.tempLow || "lower"} °C</th>
                <th scope="col">{poh.tempHigh || "upper"} °C</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{poh.paLow || "lower"} ft</th>
                <td>
                  <input aria-label="Distance at lower altitude, lower temperature" inputMode="numeric" value={poh.lowLow} onChange={(e) => setPohField("lowLow", e.target.value)} />
                </td>
                <td>
                  <input aria-label="Distance at lower altitude, upper temperature" inputMode="numeric" value={poh.lowHigh} onChange={(e) => setPohField("lowHigh", e.target.value)} />
                </td>
              </tr>
              <tr>
                <th scope="row">{poh.paHigh || "upper"} ft</th>
                <td>
                  <input aria-label="Distance at upper altitude, lower temperature" inputMode="numeric" value={poh.highLow} onChange={(e) => setPohField("highLow", e.target.value)} />
                </td>
                <td>
                  <input aria-label="Distance at upper altitude, upper temperature" inputMode="numeric" value={poh.highHigh} onChange={(e) => setPohField("highHigh", e.target.value)} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="airport-section" style={{ marginTop: 18 }}>Corrections from your AFM (%)</h3>
        <div className="perf-inputs">
          {CORRECTIONS.map((c) => (
            <div className="field" key={c.key}>
              <label htmlFor={`corr-${c.key}`}>{c.label}</label>
              <input
                id={`corr-${c.key}`}
                inputMode="numeric"
                placeholder={c.hint}
                value={corrections[c.key]}
                onChange={(e) => setCorrections((p) => ({ ...p, [c.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        {interpolation && (
          <div style={{ marginTop: 16 }}>
            {!interpolation.ok ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{interpolation.reason}</p>
            ) : (
              <>
                <div className="perf-results">
                  <div className="perf-result">
                    <span className="perf-result-label">Interpolated</span>
                    <span className="perf-result-value">{ft(interpolation.distance)}</span>
                    <span className="perf-result-sub">
                      at {ft(atmosphere!.pa)} PA and {oat} °C
                    </span>
                  </div>
                  {interpolation.percents.length > 0 && (
                    <div className="perf-result">
                      <span className="perf-result-label">With corrections</span>
                      <span className="perf-result-value perf-headline">{ft(interpolation.corrected)}</span>
                      <span className="perf-result-sub">
                        {interpolation.percents.map((p) => signed(p, "%")).join(", ")} applied
                      </span>
                    </div>
                  )}
                  {longest !== null && (
                    <div className="perf-result">
                      <span className="perf-result-label">Longest runway</span>
                      <span className="perf-result-value">{longest.toLocaleString()} ft</span>
                      <span className="perf-result-sub">
                        {ft(longest - interpolation.corrected)} to spare
                      </span>
                    </div>
                  )}
                </div>
                <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
                  Straight-line interpolation between the values you entered, with no safety factor
                  and no allowance for a worn engine, a soft surface, or your own technique. Apply
                  the margin your AFM and your operating rules call for.
                </p>
              </>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { solve, lapsed, CLIMB_CHART, DESCENT_CHART, type ChartInfo } from "@/lib/climbdescent";

function num(v: string): number {
  return v.trim() === "" ? NaN : Number(v);
}

const ft = (v: number) => `${Math.round(v).toLocaleString()} ft`;

/**
 * Time, fuel and distance to climb and to descend — figures 5-17 and 5-37.
 *
 * You give it the two ends of the climb or descent, a pressure altitude and a
 * temperature each, and it walks both of them through the chart and subtracts,
 * which is what the figure's own worked example does. The two readings are shown
 * as well as the answer, so the working can be checked against the paper.
 *
 * Cruise temperature starts on a standard lapse rate from the field, because
 * that is usually the one you don't have. It is an ordinary field and typing
 * over it stops it tracking.
 */
export default function ClimbDescentCalculator({
  seed,
}: {
  seed?: { elevationFt?: number | null; temperatureC?: number | null };
}) {
  const [phase, setPhase] = useState<"climb" | "descent">("climb");
  const chart: ChartInfo = phase === "climb" ? CLIMB_CHART : DESCENT_CHART;

  const [fieldAlt, setFieldAlt] = useState(
    seed?.elevationFt != null ? String(Math.round(seed.elevationFt)) : ""
  );
  const [fieldOat, setFieldOat] = useState(
    seed?.temperatureC != null ? String(Math.round(seed.temperatureC)) : ""
  );
  const [cruiseAlt, setCruiseAlt] = useState("6000");
  /** Empty means "follow the standard lapse rate from the field". */
  const [cruiseOat, setCruiseOat] = useState("");

  const fa = num(fieldAlt), fo = num(fieldOat), ca = num(cruiseAlt);
  const lapsedOat =
    Number.isFinite(fo) && Number.isFinite(fa) && Number.isFinite(ca) ? lapsed(fo, fa, ca) : NaN;
  const co = cruiseOat.trim() !== "" ? num(cruiseOat) : lapsedOat;
  const cruiseOatIsLapsed = cruiseOat.trim() === "" && Number.isFinite(lapsedOat);

  const ready =
    Number.isFinite(fa) && Number.isFinite(fo) && Number.isFinite(ca) && Number.isFinite(co);

  const answer = useMemo(() => {
    if (!ready) return null;
    return solve(chart, { pressureAlt: fa, oatC: fo }, { pressureAlt: ca, oatC: co });
  }, [ready, chart, fa, fo, ca, co]);

  const climbing = phase === "climb";
  // "Departure airport pressure altitude" wraps; the full name is in the table.
  const short = climbing ? "Departure" : "Destination";
  const backwards = ready && ca < fa;

  return (
    <div className="card">
      <h2>Time, Fuel and Distance to {climbing ? "Climb" : "Descend"}</h2>
      <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
        Figure {chart.figure} — {chart.conditions.join(", ")}.
      </p>

      <div className="perf-inputs">
        <div className="field">
          <label htmlFor="cd-phase">Phase</label>
          <select
            id="cd-phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value as "climb" | "descent")}
          >
            <option value="climb">Climb — figure 5-17</option>
            <option value="descent">Descent — figure 5-37</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="cd-field-alt">{short} pressure altitude (ft)</label>
          <input
            id="cd-field-alt"
            inputMode="numeric"
            value={fieldAlt}
            onChange={(e) => setFieldAlt(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cd-field-oat">{short} temperature (°C)</label>
          <input
            id="cd-field-oat"
            inputMode="numeric"
            value={fieldOat}
            onChange={(e) => setFieldOat(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cd-cruise-alt">Cruise pressure altitude (ft)</label>
          <input
            id="cd-cruise-alt"
            inputMode="numeric"
            value={cruiseAlt}
            onChange={(e) => setCruiseAlt(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="cd-cruise-oat">Cruise temperature (°C)</label>
          <input
            id="cd-cruise-oat"
            inputMode="numeric"
            value={cruiseOat}
            onChange={(e) => setCruiseOat(e.target.value)}
            placeholder={Number.isFinite(lapsedOat) ? String(lapsedOat) : "optional"}
          />
          {cruiseOatIsLapsed && (
            <span className="field-hint">
              {lapsedOat} °C, on a standard 2 °C per 1,000 ft lapse from the field. Type your own to
              override.
            </span>
          )}
        </div>
      </div>

      {!ready && (
        <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>
          Enter both altitudes and the {chart.labels.field.toLowerCase()} temperature to read the
          chart.
        </p>
      )}

      {backwards && (
        <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>
          Cruise is below the {chart.labels.field.toLowerCase()} here, so the answer comes out
          negative. Swap the two altitudes.
        </p>
      )}

      {answer && (
        <>
          <div className="perf-results" style={{ marginTop: 18 }}>
            <div className="perf-result">
              <span className="perf-result-label">Time to {climbing ? "climb" : "descend"}</span>
              <span className="perf-result-value perf-headline">
                {answer.result.timeMin.toFixed(1)} min
              </span>
            </div>
            <div className="perf-result">
              <span className="perf-result-label">Fuel</span>
              <span className="perf-result-value perf-headline">
                {answer.result.fuelGal.toFixed(1)} gal
              </span>
            </div>
            <div className="perf-result">
              <span className="perf-result-label">Distance</span>
              <span className="perf-result-value perf-headline">
                {answer.result.distanceNm.toFixed(1)} n.m.
              </span>
            </div>
          </div>

          <table className="perf-table" style={{ marginTop: 18 }}>
            <caption className="muted" style={{ captionSide: "top", textAlign: "left", fontSize: 13, paddingBottom: 6 }}>
              Read off figure {chart.figure} at each end, then subtracted — the same working the
              chart prints in its own example.
            </caption>
            <thead>
              <tr>
                <th scope="col">Read at</th>
                <th scope="col">Time</th>
                <th scope="col">Fuel</th>
                <th scope="col">Distance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  Cruise — {ft(ca)}, {co} °C
                </th>
                <td>{answer.cruise.timeMin.toFixed(1)} min</td>
                <td>{answer.cruise.fuelGal.toFixed(1)} gal</td>
                <td>{answer.cruise.distanceNm.toFixed(1)} n.m.</td>
              </tr>
              <tr>
                <th scope="row">
                  {chart.labels.field} — {ft(fa)}, {fo} °C
                </th>
                <td>−{answer.field.timeMin.toFixed(1)} min</td>
                <td>−{answer.field.fuelGal.toFixed(1)} gal</td>
                <td>−{answer.field.distanceNm.toFixed(1)} n.m.</td>
              </tr>
            </tbody>
          </table>

          {answer.result.warnings.map((w) => (
            <p key={w} className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
              {w}
            </p>
          ))}
        </>
      )}

      <p className="muted" style={{ margin: "16px 0 0", fontSize: 12 }}>
        Digitised from figures 5-17 and 5-37 of the PA-28-181 POH (Piper VB-2960). Readings agree
        with the construction lines printed on each chart to within about half a unit, which is
        finer than the charts can be read by hand — but this is a convenience, not the book.
      </p>
    </div>
  );
}

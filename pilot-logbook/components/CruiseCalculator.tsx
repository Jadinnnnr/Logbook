"use client";

import { useState } from "react";
import {
  CRUISE_TABLES, readCruise, deviationsAt, deviationLabel, legFor, ceilingFor, isaTempC,
} from "@/lib/cruise";

/** The VFR cruising altitudes, which is what people actually type here. */
const VFR_ALTITUDES = [3500, 4500, 5500, 6500, 7500, 8500, 9500];

export default function CruiseCalculator() {
  const [power, setPower] = useState(65);
  const [altitude, setAltitude] = useState("7500");
  const [isaDev, setIsaDev] = useState(0);
  const [distance, setDistance] = useState("");

  const alt = altitude.trim() === "" ? NaN : Number(altitude);
  const haveAlt = Number.isFinite(alt) && alt >= 0;
  const devs = haveAlt ? deviationsAt(power, alt) : [];
  // Climbing can strand the chosen deviation: the blocks narrow with altitude,
  // so ISA+20 exists at 6,000 ft and not at 8,000.
  const dev = devs.includes(isaDev) ? isaDev : nearest(devs, isaDev);

  const result = haveAlt ? readCruise(power, alt, dev) : null;
  const reading = result?.ok ? result.reading : null;
  const dist = distance.trim() === "" ? NaN : Number(distance);
  const leg = reading && Number.isFinite(dist) && dist > 0 ? legFor(reading, dist) : null;

  return (
    <div className="card">
      <h2>Cruise Performance</h2>
      <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
        Figures 5-21, 5-23 and 5-25 — gross weight 2,550 lb, best economy mixture.
      </p>

      <div className="perf-inputs">
        <div className="field">
          <label htmlFor="cr-power">Power</label>
          <select
            id="cr-power"
            value={power}
            onChange={(e) => {
              const p = Number(e.target.value);
              setPower(p);
              const next = Number.isFinite(alt) ? deviationsAt(p, alt) : [];
              if (next.length) setIsaDev(nearest(next, dev));
            }}
          >
            {CRUISE_TABLES.map((t) => (
              <option key={t.power} value={t.power}>
                {t.power}% — figure {t.figure}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Published to {ceilingFor(power).toLocaleString()} ft.
          </span>
        </div>

        <div className="field">
          <label htmlFor="cr-alt">Cruise pressure altitude (ft)</label>
          <input
            id="cr-alt"
            inputMode="numeric"
            list="cr-vfr-altitudes"
            value={altitude}
            onChange={(e) => setAltitude(e.target.value)}
          />
          <datalist id="cr-vfr-altitudes">
            {VFR_ALTITUDES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          <span className="field-hint">
            Any altitude — the table steps in thousands, so 5,500 or 7,500 is read between the two
            either side.
          </span>
        </div>

        <div className="field">
          <label htmlFor="cr-isa">Temperature</label>
          <select
            id="cr-isa"
            value={dev}
            onChange={(e) => setIsaDev(Number(e.target.value))}
            disabled={!devs.length}
          >
            {devs.map((d) => (
              <option key={d} value={d}>
                {deviationLabel(d)} — {Math.round(isaTempC(haveAlt ? alt : 0) + d)} °C
              </option>
            ))}
          </select>
          <span className="field-hint">
            The deviations the book prints at this altitude. The warm end narrows as you climb.
          </span>
        </div>

        <div className="field">
          <label htmlFor="cr-dist">Leg distance (n.m.)</label>
          <input
            id="cr-dist"
            inputMode="numeric"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="optional"
          />
          <span className="field-hint">
            Adds time and fuel for the leg, in still air. Wind is not in these tables.
          </span>
        </div>
      </div>

      {!haveAlt && (
        <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>
          Enter a cruise altitude to read the tables.
        </p>
      )}

      {result && !result.ok && (
        <p style={{ margin: "14px 0 0", color: "var(--status-warning)" }}>{result.reason}</p>
      )}

      {reading && (
        <>
          <div className="perf-results" style={{ marginTop: 18 }}>
            <div className="perf-result">
              <span className="perf-result-label">True airspeed</span>
              <span className="perf-result-value perf-headline">
                {reading.ktas.toFixed(reading.exact ? 0 : 1)} kt
              </span>
            </div>
            <div className="perf-result">
              <span className="perf-result-label">Engine speed</span>
              <span className="perf-result-value perf-headline">
                {reading.rpm.toLocaleString()} rpm
              </span>
            </div>
            <div className="perf-result">
              <span className="perf-result-label">Fuel flow</span>
              <span className="perf-result-value perf-headline">
                {reading.gph.toFixed(1)} gal/h
              </span>
            </div>
            <div className="perf-result">
              <span className="perf-result-label">Range</span>
              <span className="perf-result-value">{reading.nmPerGal.toFixed(1)} n.m./gal</span>
            </div>
          </div>

          {leg && (
            <p style={{ margin: "14px 0 0" }}>
              Over {dist.toLocaleString()} n.m. that is <strong>{leg.minutes} min</strong> and{" "}
              <strong>{leg.gallons.toFixed(1)} gal</strong>, still air.
            </p>
          )}

          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>
            {reading.exact ? (
              <>
                Straight off figure {reading.figure} at{" "}
                {reading.altFt === 0 ? "sea level" : `${reading.altFt.toLocaleString()} ft`},{" "}
                {deviationLabel(reading.isaDev)} — nothing has been interpolated. Outside air
                temperature {reading.oatC} °C.
              </>
            ) : (
              <>
                Interpolated{" "}
                {reading.between && (
                  <>
                    between the {reading.between[0].toLocaleString()} ft and{" "}
                    {reading.between[1].toLocaleString()} ft rows of figure {reading.figure}
                  </>
                )}
                {reading.between && reading.tasBetweenRows && ", and "}
                {!reading.between && reading.tasBetweenRows && "on figure " + reading.figure + " "}
                {reading.tasBetweenRows && (
                  <>
                    along the block for true airspeed, which the book prints only at the coldest and
                    warmest row
                  </>
                )}
                . Fuel flow is fixed for the power setting. Outside air temperature{" "}
                {reading.oatC} °C at {deviationLabel(reading.isaDev)}.
              </>
            )}
          </p>
        </>
      )}

      <p className="muted" style={{ margin: "16px 0 0", fontSize: 12 }}>
        Read out of the PA-28-181 POH&rsquo;s own tables (Piper VB-2960), not measured off a graph.
        They assume 2,550 lb and best economy mixture, and take no account of wind.
      </p>
    </div>
  );
}

/** The published value closest to one that is no longer on offer. */
function nearest(options: number[], want: number): number {
  if (!options.length) return want;
  return options.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
}

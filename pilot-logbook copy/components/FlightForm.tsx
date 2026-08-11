"use client";

import { useState } from "react";
import type { Aircraft, Flight } from "@/lib/db";
import { saveFlight } from "@/lib/actions";

const HOUR_FIELDS: [keyof Flight, string][] = [
  ["total_time", "Total Time"],
  ["pic", "PIC"],
  ["sic", "SIC"],
  ["dual_received", "Dual Received"],
  ["solo", "Solo"],
  ["night", "Night"],
  ["cross_country", "Cross-Country"],
  ["actual_instrument", "Actual Instrument"],
  ["simulated_instrument", "Simulated Instrument"],
];

const COUNT_FIELDS: [keyof Flight, string][] = [
  ["day_landings", "Day Landings"],
  ["night_landings", "Night Landings"],
  ["night_full_stop_landings", "Night Full-Stop Landings"],
  ["approaches", "Approaches"],
  ["holds", "Holds"],
];

export default function FlightForm({ flight, fleet }: { flight?: Flight; fleet: Aircraft[] }) {
  // Preselect the profile matching the flight's tail number when editing.
  const matched = flight
    ? fleet.find((a) => a.tail_number.toUpperCase() === flight.tail_number.toUpperCase())
    : undefined;
  const [aircraftId, setAircraftId] = useState(matched ? String(matched.id) : "");
  const [tail, setTail] = useState(flight?.tail_number ?? "");
  const [type, setType] = useState(flight?.aircraft_type ?? "");

  /** Picking a profile fills the two fields in; "enter manually" clears them. */
  const chooseAircraft = (id: string) => {
    setAircraftId(id);
    const a = fleet.find((x) => String(x.id) === id);
    if (a) {
      setTail(a.tail_number);
      setType(a.aircraft_type);
    } else {
      setTail("");
      setType("");
    }
  };

  return (
    <form action={saveFlight} className="stack">
      {flight && <input type="hidden" name="id" value={flight.id} />}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="date">Date *</label>
          <input id="date" name="date" type="date" required defaultValue={flight?.date ?? ""} />
        </div>
        {fleet.length > 0 && (
          <div className="field">
            <label htmlFor="aircraft_id">Aircraft (from profiles)</label>
            <select
              id="aircraft_id"
              name="aircraft_id"
              value={aircraftId}
              onChange={(e) => chooseAircraft(e.target.value)}
            >
              <option value="">— enter manually below —</option>
              {fleet.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.tail_number} {a.aircraft_type && `(${a.aircraft_type})`}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="tail_number">Tail number</label>
          <input
            id="tail_number"
            name="tail_number"
            placeholder="N12345"
            value={tail}
            onChange={(e) => {
              setTail(e.target.value.toUpperCase());
              setAircraftId("");
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="aircraft_type">Aircraft type</label>
          <input
            id="aircraft_type"
            name="aircraft_type"
            placeholder="C172"
            value={type}
            onChange={(e) => setType(e.target.value.toUpperCase())}
          />
        </div>
        <div className="field">
          <label htmlFor="from_airport">From</label>
          <input id="from_airport" name="from_airport" placeholder="KPAO" defaultValue={flight?.from_airport ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="to_airport">To</label>
          <input id="to_airport" name="to_airport" placeholder="KHAF" defaultValue={flight?.to_airport ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="route">Route</label>
          <input id="route" name="route" placeholder="Via OSI VOR" defaultValue={flight?.route ?? ""} />
        </div>
      </div>

      <h2 style={{ margin: "10px 0 0" }}>Hours</h2>
      <div className="form-grid">
        {HOUR_FIELDS.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={name}>{label}</label>
            <input
              id={name}
              name={name}
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              defaultValue={flight && (flight[name] as number) !== 0 ? (flight[name] as number) : ""}
            />
          </div>
        ))}
      </div>

      <h2 style={{ margin: "10px 0 0" }}>Landings &amp; Approaches</h2>
      <div className="form-grid">
        {COUNT_FIELDS.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={name}>{label}</label>
            <input
              id={name}
              name={name}
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              defaultValue={flight && (flight[name] as number) !== 0 ? (flight[name] as number) : ""}
            />
          </div>
        ))}
      </div>

      <div className="field">
        <label htmlFor="remarks">Remarks</label>
        <textarea id="remarks" name="remarks" rows={3} defaultValue={flight?.remarks ?? ""} />
      </div>

      <div className="page-actions">
        <button type="submit">{flight ? "Save Changes" : "Log Flight"}</button>
        <a href="/flights" className="btn btn-secondary">Cancel</a>
      </div>
    </form>
  );
}

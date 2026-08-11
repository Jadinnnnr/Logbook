"use client";

import { useEffect, useRef, useState } from "react";
import { AIRCRAFT_FLAGS, CATEGORY_CLASSES } from "@/lib/aircraft";
import { saveAircraft } from "@/lib/actions";

export interface AircraftFormValues {
  id?: number;
  tail_number: string;
  aircraft_type: string;
  make_model: string;
  category_class: string;
  is_complex: boolean;
  is_high_performance: boolean;
  is_taa: boolean;
  is_tailwheel: boolean;
  notes: string;
}

interface LookupResult {
  found: boolean;
  aircraft?: {
    tailNumber: string;
    makeModel: string;
    typeCode: string;
    categoryClass: string;
    horsepower: number | null;
    highPerformance: boolean;
    year: number | null;
  };
}

const BLANK: AircraftFormValues = {
  tail_number: "",
  aircraft_type: "",
  make_model: "",
  category_class: "ASEL",
  is_complex: false,
  is_high_performance: false,
  is_taa: false,
  is_tailwheel: false,
  notes: "",
};

export default function AircraftForm({
  editing,
  registryAvailable,
}: {
  editing?: AircraftFormValues;
  registryAvailable: boolean;
}) {
  const [values, setValues] = useState<AircraftFormValues>(editing ?? BLANK);
  const [status, setStatus] = useState<string | null>(null);
  // Fields the registry filled, so a later lookup may replace them but
  // anything the pilot typed themselves is left alone.
  const autoFilled = useRef<Set<keyof AircraftFormValues>>(new Set());
  const lastQueried = useRef<string>("");

  const set = <K extends keyof AircraftFormValues>(key: K, value: AircraftFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  /** Edit by hand and the field stops being ours to overwrite. */
  const setManually = <K extends keyof AircraftFormValues>(key: K, value: AircraftFormValues[K]) => {
    autoFilled.current.delete(key);
    set(key, value);
  };

  useEffect(() => {
    if (!registryAvailable) return;
    const tail = values.tail_number.trim().toUpperCase();
    if (tail.length < 2 || tail === lastQueried.current) return;

    const timer = setTimeout(async () => {
      lastQueried.current = tail;
      setStatus("Looking up…");
      try {
        const res = await fetch(`/api/aircraft-lookup?tail=${encodeURIComponent(tail)}`);
        const data: LookupResult = await res.json();
        if (!data.found || !data.aircraft) {
          setStatus(`${tail} isn't in the FAA registry — fill the rest in yourself.`);
          return;
        }
        const a = data.aircraft;
        setValues((v) => {
          const next = { ...v };
          const fill = <K extends keyof AircraftFormValues>(key: K, value: AircraftFormValues[K]) => {
            const untouched = !v[key] || autoFilled.current.has(key);
            if (value && untouched) {
              next[key] = value;
              autoFilled.current.add(key);
            }
          };
          fill("make_model", a.makeModel as AircraftFormValues["make_model"]);
          fill("aircraft_type", a.typeCode as AircraftFormValues["aircraft_type"]);
          if (a.categoryClass && (v.category_class === "ASEL" || autoFilled.current.has("category_class"))) {
            next.category_class = a.categoryClass;
            autoFilled.current.add("category_class");
          }
          if (a.highPerformance && !v.is_high_performance) {
            next.is_high_performance = true;
            autoFilled.current.add("is_high_performance");
          }
          return next;
        });
        const bits = [a.makeModel];
        if (a.year) bits.push(String(a.year));
        if (a.horsepower) bits.push(`${a.horsepower} hp`);
        setStatus(`Filled from the FAA registry: ${bits.join(" · ")}.`);
      } catch {
        setStatus("Couldn't reach the registry — fill the rest in yourself.");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [values.tail_number, registryAvailable]);

  return (
    <form action={saveAircraft} className="stack">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="tail_number">Tail number *</label>
          <input
            id="tail_number"
            name="tail_number"
            required
            placeholder="N12345"
            autoComplete="off"
            value={values.tail_number}
            onChange={(e) => set("tail_number", e.target.value.toUpperCase())}
          />
          {registryAvailable && (
            <span className="field-hint">
              {status ?? "US registrations fill in the details below automatically."}
            </span>
          )}
        </div>
        <div className="field">
          <label htmlFor="aircraft_type">Type code</label>
          <input
            id="aircraft_type"
            name="aircraft_type"
            placeholder="C172"
            value={values.aircraft_type}
            onChange={(e) => setManually("aircraft_type", e.target.value.toUpperCase())}
          />
        </div>
        <div className="field">
          <label htmlFor="make_model">Make &amp; model</label>
          <input
            id="make_model"
            name="make_model"
            placeholder="Cessna 172N"
            value={values.make_model}
            onChange={(e) => setManually("make_model", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="category_class">Category / class</label>
          <select
            id="category_class"
            name="category_class"
            value={values.category_class}
            onChange={(e) => setManually("category_class", e.target.value)}
          >
            {CATEGORY_CLASSES.map(([code, label]) => (
              <option key={code} value={code}>
                {label} ({code})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Characteristics</label>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {AIRCRAFT_FLAGS.map(([col, label, help]) => {
            const key = col as keyof AircraftFormValues;
            return (
              <label
                key={col}
                title={help}
                style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  name={col}
                  checked={Boolean(values[key])}
                  onChange={(e) => setManually(key, e.target.checked as AircraftFormValues[typeof key])}
                />
                {label}
              </label>
            );
          })}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          Flights in this aircraft count toward complex / high-performance / TAA / tailwheel time.
          High performance is set from the registry&rsquo;s engine horsepower; the other three
          depend on the individual airframe and aren&rsquo;t published, so set those yourself.
        </span>
      </div>

      <div className="field">
        <label htmlFor="notes">Notes</label>
        <input
          id="notes"
          name="notes"
          placeholder="Club plane, G5s installed"
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>

      <div className="page-actions">
        <button type="submit">{values.id ? "Save Changes" : "Add Aircraft"}</button>
        {values.id && <a href="/aircraft" className="btn btn-secondary">Cancel</a>}
      </div>
    </form>
  );
}

import { Aircraft, Credentials, Flight } from "./db";
import { categoryClassLabel } from "./aircraft.ts";
import { medicalPrivileges, PrivilegeTier } from "./medical";

export interface Totals {
  totalTime: number;
  pic: number;
  sic: number;
  dualReceived: number;
  solo: number;
  night: number;
  crossCountry: number;
  actualInstrument: number;
  simulatedInstrument: number;
  dayLandings: number;
  nightLandings: number;
  approaches: number;
  flights: number;
}

export function computeTotals(flights: Flight[]): Totals {
  const t: Totals = {
    totalTime: 0, pic: 0, sic: 0, dualReceived: 0, solo: 0, night: 0,
    crossCountry: 0, actualInstrument: 0, simulatedInstrument: 0,
    dayLandings: 0, nightLandings: 0, approaches: 0, flights: flights.length,
  };
  for (const f of flights) {
    t.totalTime += f.total_time;
    t.pic += f.pic;
    t.sic += f.sic;
    t.dualReceived += f.dual_received;
    t.solo += f.solo;
    t.night += f.night;
    t.crossCountry += f.cross_country;
    t.actualInstrument += f.actual_instrument;
    t.simulatedInstrument += f.simulated_instrument;
    t.dayLandings += f.day_landings;
    t.nightLandings += f.night_landings;
    t.approaches += f.approaches;
  }
  return t;
}

export type CurrencyState = "good" | "warning" | "critical";

/** A line inside a currency card — one privilege level, or one day/night check. */
export interface CurrencyRow {
  label: string;
  state: CurrencyState;
  detail: string;
  /** Long-form explanation, shown as a tooltip. */
  scope?: string;
  /** Struck through: this level is gone, not merely failing. */
  lapsed?: boolean;
}

export interface CurrencyItem {
  /** Stable slot key: "passenger" | "medical" | "review" | "instrument". */
  id: string;
  label: string;
  state: CurrencyState;
  detail: string;
  reference: string;
  rows?: CurrencyRow[];
}

/** A card is only as healthy as its worst row. */
function worstState(rows: CurrencyRow[]): CurrencyState {
  if (rows.some((r) => r.state === "critical")) return "critical";
  if (rows.some((r) => r.state === "warning")) return "warning";
  return "good";
}

function daysAgo(days: number, from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** End of the calendar month `months` months after the given date (FAA "24 calendar months"). */
function endOfCalendarMonths(dateStr: string, months: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + months + 1, 0);
}

/**
 * Passenger-currency cards per FAA category/class (61.57 currency is held per
 * category and class). Flights are grouped by matching tail number to the
 * pilot's aircraft profiles. Without any profiles, falls back to counting all
 * landings together.
 */
function passengerCurrency(flights: Flight[], aircraft: Map<string, Aircraft>, now: Date): CurrencyItem {
  const cutoff90 = fmtDate(daysAgo(90, now));
  const recent = flights.filter((f) => f.date >= cutoff90);
  const rows: CurrencyRow[] = [];

  // `scope` prefixes the row labels when more than one category/class is in play.
  const addPair = (scope: string | null, group: Flight[]) => {
    const prefix = scope ? `${scope} — ` : "";
    // 61.57(a): 3 takeoffs and landings in the preceding 90 days to carry
    // passengers. Takeoffs are assumed equal to landings logged.
    const landings = group.reduce((s, f) => s + f.day_landings + f.night_landings, 0);
    rows.push({
      label: `${prefix}Day`,
      state: landings >= 3 ? "good" : "critical",
      detail: `${landings} of 3 landings in 90 days`,
      scope: "14 CFR 61.57(a) — 3 takeoffs and landings in the preceding 90 days",
    });
    // 61.57(b): 3 full-stop landings at night in the preceding 90 days.
    const nightFullStop = group.reduce((s, f) => s + f.night_full_stop_landings, 0);
    rows.push({
      label: `${prefix}Night`,
      state: nightFullStop >= 3 ? "good" : "critical",
      detail: `${nightFullStop} of 3 full-stop night landings in 90 days`,
      scope: "14 CFR 61.57(b) — 3 night full-stop landings in the preceding 90 days",
    });
  };

  let detail: string;
  if (aircraft.size === 0) {
    addPair(null, recent);
    detail = "All aircraft together";
    rows.push({
      label: "Category & Class",
      state: "warning",
      detail: "Add aircraft profiles to track this per category and class",
    });
  } else {
    const classes = [...new Set([...aircraft.values()].map((a) => a.category_class))];
    const groupFor = (cc: string) =>
      recent.filter((f) => aircraft.get(f.tail_number.toUpperCase())?.category_class === cc);

    if (classes.length === 1) {
      addPair(null, groupFor(classes[0]));
      detail = categoryClassLabel(classes[0]);
    } else {
      for (const cc of classes) addPair(cc, groupFor(cc));
      detail = `${classes.length} categories and classes`;
    }

    const unmatched = [
      ...new Set(
        recent
          .filter((f) => f.tail_number && !aircraft.has(f.tail_number.toUpperCase()))
          .map((f) => f.tail_number)
      ),
    ];
    if (unmatched.length > 0) {
      rows.push({
        label: "Unmatched Aircraft",
        state: "warning",
        detail: `No profile for ${unmatched.join(", ")}`,
        scope: "Flights in these aircraft aren't counted toward any category or class",
      });
    }
  }

  return {
    id: "passenger",
    label: "Passenger Currency",
    state: worstState(rows),
    detail,
    reference: "14 CFR 61.57(a)–(b)",
    rows,
  };
}

/**
 * 61.57(c) instrument currency: 6 instrument approaches plus holding within the
 * preceding 6 calendar months. Counted from the 1st of the month 6 months back
 * through today. Only shown for pilots with instrument activity in the logbook.
 */
function instrumentCurrency(flights: Flight[], now: Date): CurrencyItem | null {
  const everInstrument = flights.some(
    (f) => f.approaches > 0 || f.holds > 0 || f.actual_instrument > 0 || f.simulated_instrument > 0
  );
  if (!everInstrument) return null;

  const windowStart = fmtDate(new Date(now.getFullYear(), now.getMonth() - 6, 1));
  const recent = flights.filter((f) => f.date >= windowStart);
  const approaches = recent.reduce((s, f) => s + f.approaches, 0);
  const holds = recent.reduce((s, f) => s + f.holds, 0);
  const current = approaches >= 6 && holds >= 1;

  let detail = `${approaches} of 6 approaches, ${holds} of 1 holds since ${windowStart}`;
  let state: CurrencyState = "critical";
  if (current) {
    // Currency lasts until the 6th-most-recent approach (or the most recent
    // hold) falls out of the sliding 6-calendar-month window.
    const approachDates: string[] = [];
    for (const f of recent) for (let i = 0; i < f.approaches; i++) approachDates.push(f.date);
    approachDates.sort().reverse();
    const sixth = approachDates[5];
    const lastHold = recent.filter((f) => f.holds > 0).map((f) => f.date).sort().reverse()[0];
    const limiting = sixth < lastHold ? sixth : lastHold;
    const validThrough = endOfCalendarMonths(limiting, 6);
    const daysLeft = Math.floor((validThrough.getTime() - now.getTime()) / 86400000);
    state = daysLeft <= 30 ? "warning" : "good";
    detail += ` — valid through ${fmtDate(validThrough)}`;
  } else {
    detail += ". If lapsed more than 6 months, an IPC may be required (61.57(d)).";
  }
  return { id: "instrument", label: "Instrument Currency", state, detail, reference: "14 CFR 61.57(c)" };
}

/** Hours flown in profile-flagged aircraft (complex, high-performance, TAA, tailwheel). */
export function computeSpecialTime(flights: Flight[], aircraft: Map<string, Aircraft>) {
  const t = { complex: 0, highPerformance: 0, taa: 0, tailwheel: 0 };
  for (const f of flights) {
    const a = aircraft.get(f.tail_number.toUpperCase());
    if (!a) continue;
    if (a.is_complex) t.complex += f.total_time;
    if (a.is_high_performance) t.highPerformance += f.total_time;
    if (a.is_taa) t.taa += f.total_time;
    if (a.is_tailwheel) t.tailwheel += f.total_time;
  }
  return t;
}

export function computeCurrency(
  flights: Flight[],
  aircraft: Map<string, Aircraft>,
  credentials: Credentials,
  now = new Date()
): CurrencyItem[] {
  const items: CurrencyItem[] = [passengerCurrency(flights, aircraft, now)];

  const inst = instrumentCurrency(flights, now);
  if (inst) items.push(inst);

  // 61.56: flight review — or a substitute under 61.56(d)/(e) — within the
  // preceding 24 calendar months.
  if (credentials.flightReview) {
    const { date, label } = credentials.flightReview;
    const due = endOfCalendarMonths(date, 24);
    const daysLeft = Math.floor((due.getTime() - now.getTime()) / 86400000);
    const via = `via ${label} on ${date}`;
    items.push({
      id: "review",
      label: "Flight Review",
      state: daysLeft < 0 ? "critical" : daysLeft <= 60 ? "warning" : "good",
      detail:
        daysLeft < 0
          ? `Expired ${fmtDate(due)} · ${via}`
          : `Due ${fmtDate(due)} (${daysLeft} days) · ${via}`,
      reference: "14 CFR 61.56",
    });
  } else {
    items.push({
      id: "review",
      label: "Flight Review",
      state: "warning",
      detail:
        "Nothing on file — add a flight review endorsement, or a certificate or rating you earned by practical test, on your Profile",
      reference: "14 CFR 61.56",
    });
  }

  // Medical certificate. A medical steps down through privilege levels rather
  // than simply expiring, so when the class, exam date, and date of birth are
  // known we show each 61.23(d) tier with its own remaining time. The card's
  // own state tracks the last tier — the point at which the medical is no
  // longer valid for anything.
  const med = credentials.medical;
  if (med) {
    const tiers = medicalPrivileges(med, credentials.dateOfBirth, now);
    if (tiers) {
      const last = tiers[tiers.length - 1];
      const live = tiers.filter((t) => t.valid);
      const detail = last.valid
        ? `${med.medical_class}, exam ${med.exam_date} — ${live.length} of ${tiers.length} privilege levels still valid`
        : `${med.medical_class}, exam ${med.exam_date} — no longer valid for any operation`;
      items.push({
        id: "medical",
        label: "Medical Certificate",
        // Tracks the last level to go: the medical is dead only when nothing is left.
        state: !last.valid ? "critical" : last.daysLeft <= 60 ? "warning" : "good",
        detail,
        reference: "14 CFR 61.23(d)",
        rows: tiers.map((t) => ({
          label: t.label,
          state: t.state === "lapsed" ? "critical" : t.state,
          detail: t.valid ? `${t.expires} · ${t.daysLeft} days` : `lapsed ${t.expires}`,
          scope: t.scope,
          lapsed: !t.valid,
        })),
      });
    } else if (med.expires_date) {
      // BasicMed, an unspecified class, or a record without an exam date /
      // date of birth: fall back to the single date on the record.
      const exp = new Date(med.expires_date + "T23:59:59");
      const daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86400000);
      const cls = med.medical_class !== "Unspecified" ? `${med.medical_class} — ` : "";
      const hint =
        med.medical_class === "BasicMed"
          ? ""
          : " · add your date of birth and exam date on your Profile for the full 61.23(d) breakdown";
      items.push({
        id: "medical",
        label: "Medical Certificate",
        state: daysLeft < 0 ? "critical" : daysLeft <= 60 ? "warning" : "good",
        detail:
          (daysLeft < 0
            ? `${cls}expired ${med.expires_date}`
            : `${cls}expires ${med.expires_date} (${daysLeft} days)`) + hint,
        reference: "14 CFR 61.23",
      });
    } else {
      items.push({
        id: "medical",
        label: "Medical Certificate",
        state: "warning",
        detail: "Medical on file has no expiration — add your date of birth and exam date on your Profile",
        reference: "14 CFR 61.23",
      });
    }
  } else {
    items.push({
      id: "medical",
      label: "Medical Certificate",
      state: "warning",
      detail: "No medical on file — add it on your Profile",
      reference: "14 CFR 61.23",
    });
  }

  return items;
}

export function fmtHours(h: number): string {
  return (Math.round(h * 10) / 10).toFixed(1);
}

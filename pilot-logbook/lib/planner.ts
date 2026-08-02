// Types only: keeps better-sqlite3 out of this module so the rules can be run
// under plain `node scripts/test-planner.mts`.
import type { Aircraft, Credentials, Flight } from "./db";
import type { CurrencyState } from "./currency";
import { categoryClassLabel } from "./aircraft.ts";
import { medicalPrivileges } from "./medical.ts";

/**
 * "What do I need?" — the currency cards say what your state is; this turns
 * that into the list of things you'd actually have to go and fly. Kept as pure
 * functions so the regulatory arithmetic can be tested without a database.
 */

export interface ActionItem {
  id: string;
  /** The thing to do: "6 approaches and 1 hold". */
  need: string;
  /** What it buys: "to regain instrument currency". */
  purpose: string;
  state: CurrencyState;
  /** Extra qualification, e.g. the safety-pilot rule or the deadline. */
  note?: string;
  reference: string;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number, from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

/** End of the calendar month `months` months after the given date. */
function endOfCalendarMonths(dateStr: string, months: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + months + 1, 0);
}

/** Start of the calendar month `months` months before the given date. */
function startOfCalendarMonthsBefore(d: Date, months: number): string {
  return fmtDate(new Date(d.getFullYear(), d.getMonth() - months, 1));
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function joinNeeds(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ---------------------------------------------------------------------------
// 61.57(c) instrument
// ---------------------------------------------------------------------------

/**
 * The latest date through which the pilot has ever held 61.57(c) currency.
 * Currency can only start on a day something was flown, so it's enough to test
 * the window ending at each logged date and keep the furthest expiry.
 */
function lastInstrumentValidThrough(flights: Flight[]): Date | null {
  let best: Date | null = null;
  for (const anchor of flights) {
    const windowStart = startOfCalendarMonthsBefore(new Date(anchor.date + "T00:00:00"), 6);
    const inWindow = flights.filter((f) => f.date >= windowStart && f.date <= anchor.date);

    const approachDates: string[] = [];
    for (const f of inWindow) for (let i = 0; i < f.approaches; i++) approachDates.push(f.date);
    if (approachDates.length < 6) continue;
    const holdDates = inWindow.filter((f) => f.holds > 0).map((f) => f.date);
    if (holdDates.length === 0) continue;

    approachDates.sort();
    // Currency runs out when the 6th-most-recent approach — or the most recent
    // hold, whichever is older — falls out of the six-month window.
    const sixth = approachDates[approachDates.length - 6];
    const lastHold = holdDates.sort()[holdDates.length - 1];
    const validThrough = endOfCalendarMonths(sixth < lastHold ? sixth : lastHold, 6);
    if (!best || validThrough > best) best = validThrough;
  }
  return best;
}

function instrumentAction(flights: Flight[], now: Date): ActionItem | null {
  const everInstrument = flights.some(
    (f) => f.approaches > 0 || f.holds > 0 || f.actual_instrument > 0 || f.simulated_instrument > 0
  );
  if (!everInstrument) return null;

  const windowStart = startOfCalendarMonthsBefore(now, 6);
  const recent = flights.filter((f) => f.date >= windowStart);
  const approaches = recent.reduce((s, f) => s + f.approaches, 0);
  const holds = recent.reduce((s, f) => s + f.holds, 0);

  if (approaches >= 6 && holds >= 1) {
    // Current — only worth a line if it's about to lapse.
    const approachDates: string[] = [];
    for (const f of recent) for (let i = 0; i < f.approaches; i++) approachDates.push(f.date);
    approachDates.sort();
    const sixth = approachDates[approachDates.length - 6];
    const lastHold = recent.filter((f) => f.holds > 0).map((f) => f.date).sort().reverse()[0];
    const validThrough = endOfCalendarMonths(sixth < lastHold ? sixth : lastHold, 6);
    const daysLeft = Math.floor((validThrough.getTime() - now.getTime()) / 86400000);
    if (daysLeft > 45) return null;
    return {
      id: "instrument",
      need: "6 approaches and a hold",
      purpose: `before instrument currency lapses on ${fmtDate(validThrough)}`,
      state: "warning",
      note: `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left. Fly them sooner and the clock restarts from the newer approaches.`,
      reference: "14 CFR 61.57(c)",
    };
  }

  const needApproaches = Math.max(0, 6 - approaches);
  const needHolds = Math.max(0, 1 - holds);
  const parts: string[] = [];
  if (needApproaches > 0) parts.push(plural(needApproaches, "approach", "approaches"));
  if (needHolds > 0) parts.push("1 hold");

  // 61.57(d): once you've been out of currency for more than six calendar
  // months on top of the six-month window, only an IPC gets it back.
  const lastValid = lastInstrumentValidThrough(flights);
  const ipcFrom = lastValid ? endOfCalendarMonths(fmtDate(lastValid), 6) : null;
  const needsIpc = ipcFrom !== null && now > ipcFrom;
  const neverCurrent = lastValid === null;

  if (needsIpc) {
    return {
      id: "instrument",
      need: "An instrument proficiency check",
      purpose: "to regain instrument currency",
      state: "critical",
      note: `Currency lapsed ${fmtDate(lastValid!)} — more than six calendar months ago, so the tasks alone no longer count.`,
      reference: "14 CFR 61.57(d)",
    };
  }

  return {
    id: "instrument",
    need: joinNeeds(parts),
    purpose: neverCurrent ? "to establish instrument currency" : "to regain instrument currency",
    state: "critical",
    note:
      (lastValid ? `Lapsed ${fmtDate(lastValid)}. ` : "") +
      `In VMC these need a safety pilot or a view-limiting device${ipcFrom ? `, and after ${fmtDate(ipcFrom)} it takes an IPC instead` : ""}.`,
    reference: "14 CFR 61.57(c)",
  };
}

// ---------------------------------------------------------------------------
// 61.57(a)/(b) passengers
// ---------------------------------------------------------------------------

function passengerActions(
  flights: Flight[],
  aircraft: Map<string, Aircraft>,
  now: Date
): ActionItem[] {
  const cutoff90 = fmtDate(daysAgo(90, now));
  const recent = flights.filter((f) => f.date >= cutoff90);
  const items: ActionItem[] = [];

  const forGroup = (scope: string | null, group: Flight[]) => {
    const where = scope ? ` in ${scope}` : "";
    const landings = group.reduce((s, f) => s + f.day_landings + f.night_landings, 0);
    if (landings < 3) {
      items.push({
        id: `passenger-day-${scope ?? "all"}`,
        need: plural(3 - landings, "takeoff and landing", "takeoffs and landings"),
        purpose: `to carry passengers by day${where}`,
        state: "critical",
        reference: "14 CFR 61.57(a)",
      });
    }
    const nightFullStop = group.reduce((s, f) => s + f.night_full_stop_landings, 0);
    if (nightFullStop < 3) {
      items.push({
        id: `passenger-night-${scope ?? "all"}`,
        need: plural(3 - nightFullStop, "full-stop night landing"),
        purpose: `to carry passengers at night${where}`,
        state: "critical",
        note: "Between one hour after sunset and one hour before sunrise.",
        reference: "14 CFR 61.57(b)",
      });
    }
  };

  if (aircraft.size === 0) {
    forGroup(null, recent);
    return items;
  }

  // Only categories and classes the pilot has actually flown at some point are
  // worth nagging about — an aircraft profile they've never flown isn't a gap.
  const flownClasses = new Set(
    flights
      .map((f) => aircraft.get(f.tail_number.toUpperCase())?.category_class)
      .filter((c): c is string => Boolean(c))
  );
  const classes = [...flownClasses];
  if (classes.length === 0) return items;

  for (const cc of classes) {
    const group = recent.filter(
      (f) => aircraft.get(f.tail_number.toUpperCase())?.category_class === cc
    );
    forGroup(classes.length === 1 ? null : categoryClassLabel(cc), group);
  }
  return items;
}

// ---------------------------------------------------------------------------

export function computeActions(
  flights: Flight[],
  aircraft: Map<string, Aircraft>,
  credentials: Credentials,
  now = new Date()
): ActionItem[] {
  const items: ActionItem[] = [];

  const inst = instrumentAction(flights, now);
  if (inst) items.push(inst);

  items.push(...passengerActions(flights, aircraft, now));

  // 61.56 flight review.
  if (!credentials.flightReview) {
    items.push({
      id: "review",
      need: "A flight review on file",
      purpose: "to act as pilot in command at all",
      state: "warning",
      note: "Add the endorsement — or a certificate or rating earned by practical test — on your Profile.",
      reference: "14 CFR 61.56",
    });
  } else {
    const due = endOfCalendarMonths(credentials.flightReview.date, 24);
    const daysLeft = Math.floor((due.getTime() - now.getTime()) / 86400000);
    if (daysLeft < 0) {
      items.push({
        id: "review",
        need: "A flight review",
        purpose: "to act as pilot in command",
        state: "critical",
        note: `Expired ${fmtDate(due)}. At least 1 hour of ground and 1 hour of flight with an instructor.`,
        reference: "14 CFR 61.56",
      });
    } else if (daysLeft <= 90) {
      items.push({
        id: "review",
        need: "A flight review",
        purpose: `before ${fmtDate(due)}`,
        state: "warning",
        note: `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left. A checkride or a WINGS phase counts instead.`,
        reference: "14 CFR 61.56",
      });
    }
  }

  // 61.23 medical — flag the next privilege level to go, not every level.
  const med = credentials.medical;
  if (!med) {
    items.push({
      id: "medical",
      need: "A medical certificate on file",
      purpose: "to exercise pilot privileges",
      state: "warning",
      note: "Add it on your Profile so the privilege levels can be tracked.",
      reference: "14 CFR 61.23",
    });
  } else {
    const tiers = medicalPrivileges(med, credentials.dateOfBirth, now);
    const live = tiers?.filter((t) => t.valid) ?? [];
    if (tiers && live.length === 0) {
      items.push({
        id: "medical",
        need: "A new medical exam",
        purpose: "to exercise any medical-requiring privilege",
        state: "critical",
        note: `The ${med.medical_class.toLowerCase()} from ${med.exam_date} is no longer valid for any operation.`,
        reference: "14 CFR 61.23(d)",
      });
    } else if (tiers && live.length > 0 && live[0].daysLeft <= 60) {
      const next = live[0];
      items.push({
        id: "medical",
        need: "A new medical exam",
        purpose: `to keep ${next.label.toLowerCase()} privileges`,
        state: "warning",
        note: `They lapse ${next.expires} — ${next.daysLeft} ${next.daysLeft === 1 ? "day" : "days"} away.${live.length > 1 ? ` ${live[live.length - 1].label} privileges run to ${live[live.length - 1].expires}.` : ""}`,
        reference: "14 CFR 61.23(d)",
      });
    } else if (!tiers && med.expires_date) {
      const daysLeft = Math.floor(
        (new Date(med.expires_date + "T23:59:59").getTime() - now.getTime()) / 86400000
      );
      if (daysLeft < 0) {
        items.push({
          id: "medical",
          need: "A new medical",
          purpose: "to exercise pilot privileges",
          state: "critical",
          note: `Expired ${med.expires_date}.`,
          reference: "14 CFR 61.23",
        });
      } else if (daysLeft <= 60) {
        items.push({
          id: "medical",
          need: "A new medical",
          purpose: `before ${med.expires_date}`,
          state: "warning",
          note: `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left.`,
          reference: "14 CFR 61.23",
        });
      }
    }
  }

  // Blockers first: what you cannot legally do today outranks what expires soon.
  const rank = { critical: 0, warning: 1, good: 2 };
  return items.sort((a, b) => rank[a.state] - rank[b.state]);
}

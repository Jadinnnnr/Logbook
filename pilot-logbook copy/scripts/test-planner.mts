// Tests for the dashboard "What do I need?" planner — the 61.57 / 61.56 / 61.23
// arithmetic behind each suggested action.
// Run with: node scripts/test-planner.mts
import { computeActions } from "../lib/planner.ts";
import type { Aircraft, Credentials, Flight } from "../lib/db.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

const NOW = new Date("2026-08-01T12:00:00");

function flight(date: string, over: Partial<Flight> = {}): Flight {
  return {
    id: 0, user_id: 1, date, tail_number: "N12345", aircraft_type: "", from_airport: "",
    to_airport: "", route: "", total_time: 1, pic: 1, sic: 0, dual_received: 0, solo: 0,
    night: 0, cross_country: 0, actual_instrument: 0, simulated_instrument: 0,
    day_landings: 1, night_landings: 0, night_full_stop_landings: 0, approaches: 0,
    holds: 0, remarks: "",
    ...over,
  } as Flight;
}

const NO_AIRCRAFT = new Map<string, Aircraft>();
/** A review and medical far enough out that they never show up as noise. */
const CLEAN: Credentials = {
  flightReview: { date: "2026-01-15", label: "Flight review (61.56)" },
  medical: { medical_class: "Third class", exam_date: "2026-01-10", expires_date: null },
  dateOfBirth: "1990-01-01",
} as unknown as Credentials;

const ids = (fs: Flight[], cr: Credentials = CLEAN) =>
  computeActions(fs, NO_AIRCRAFT, cr, NOW).map((a) => a.id);
const find = (fs: Flight[], id: string, cr: Credentials = CLEAN) =>
  computeActions(fs, NO_AIRCRAFT, cr, NOW).find((a) => a.id === id);

// --- 61.57(c) instrument ---
// Never flown anything instrument: no instrument line at all.
check("no instrument history means no instrument action", ids([flight("2026-07-20")]).includes("instrument"), false);

// Lapsed inside the six-month grace: the tasks still get it back.
// 61.57(c) looks back six *calendar* months, so from 1 Aug 2026 the window
// opens on 1 Feb — January activity is out of it.
const lapsedRecently = [
  ...Array.from({ length: 6 }, (_, i) => flight(`2026-01-0${i + 1}`, { approaches: 1 })),
  flight("2026-01-01", { holds: 1 }),
];
const lapsed = find(lapsedRecently, "instrument");
check("lapsed: 6 approaches and 1 hold", lapsed?.need, "6 approaches and 1 hold");
check("lapsed: framed as regaining", lapsed?.purpose, "to regain instrument currency");
check("lapsed: critical", lapsed?.state, "critical");
check("lapsed: cites 61.57(c)", lapsed?.reference, "14 CFR 61.57(c)");
check("lapsed: mentions the safety pilot", lapsed?.note?.includes("safety pilot"), true);

// Part-way there: only the shortfall is asked for.
const partial = [
  flight("2026-06-10", { approaches: 4 }),
  flight("2026-06-11", { holds: 1 }),
];
check("partial: only the missing approaches", find(partial, "instrument")?.need, "2 approaches");

// Approaches done, hold missing.
const noHold = [flight("2026-06-10", { approaches: 6 })];
check("hold only", find(noHold, "instrument")?.need, "1 hold");

// Current with plenty of time: no line at all.
const current = [
  flight("2026-07-25", { approaches: 6 }),
  flight("2026-07-25", { holds: 1 }),
];
check("current with room: silent", ids(current).includes("instrument"), false);

// Current but about to lapse — the 6th approach falls out at the end of January.
const expiring = [
  flight("2026-02-20", { approaches: 6 }),
  flight("2026-02-20", { holds: 1 }),
];
const soon = find(expiring, "instrument");
check("expiring: warns", soon?.state, "warning");
check("expiring: names the lapse date", soon?.purpose, "before instrument currency lapses on 2026-08-31");

// Long lapsed: an IPC is the only way back (61.57(d)).
const longLapsed = [
  ...Array.from({ length: 6 }, (_, i) => flight(`2025-06-0${i + 1}`, { approaches: 1 })),
  flight("2025-06-01", { holds: 1 }),
];
const ipc = find(longLapsed, "instrument");
check("long lapsed: needs an IPC", ipc?.need, "An instrument proficiency check");
check("long lapsed: cites 61.57(d)", ipc?.reference, "14 CFR 61.57(d)");

// Instrument time logged but never six approaches: "establish", not "regain".
const neverCurrent = [flight("2026-07-01", { actual_instrument: 1.5, approaches: 1 })];
check(
  "never current: framed as establishing",
  find(neverCurrent, "instrument")?.purpose,
  "to establish instrument currency"
);

// --- 61.57(a)/(b) passengers ---
const noRecent = ids([flight("2025-01-01")]);
check("no recent landings: day action", noRecent.includes("passenger-day-all"), true);
check("no recent landings: night action", noRecent.includes("passenger-night-all"), true);
check(
  "two landings needs one more",
  find([flight("2026-07-20", { day_landings: 2 })], "passenger-day-all")?.need,
  "1 takeoff and landing"
);
check(
  "three landings clears the day action",
  ids([flight("2026-07-20", { day_landings: 3 })]).includes("passenger-day-all"),
  false
);
check(
  "landings 91 days ago don't count",
  find([flight("2026-05-01", { day_landings: 5 })], "passenger-day-all")?.need,
  "3 takeoffs and landings"
);
check(
  "night full-stops are counted separately",
  find([flight("2026-07-20", { day_landings: 3, night_full_stop_landings: 1 })], "passenger-night-all")?.need,
  "2 full-stop night landings"
);

// --- 61.56 flight review ---
const noReview = { ...CLEAN, flightReview: null } as unknown as Credentials;
check("no review on file warns", find([flight("2026-07-20")], "review", noReview)?.state, "warning");
const expiredReview = {
  ...CLEAN,
  flightReview: { date: "2024-01-15", label: "Flight review (61.56)" },
} as unknown as Credentials;
check("expired review is critical", find([flight("2026-07-20")], "review", expiredReview)?.state, "critical");
// 24 calendar months from Sept 2024 runs to the end of Sept 2026 — inside 90 days of 1 Aug.
const dueSoon = {
  ...CLEAN,
  flightReview: { date: "2024-09-15", label: "Flight review (61.56)" },
} as unknown as Credentials;
check("review due soon warns", find([flight("2026-07-20")], "review", dueSoon)?.state, "warning");
check("review with two years left is silent", ids([flight("2026-07-20")]).includes("review"), false);

// --- 61.23 medical ---
const noMedical = { ...CLEAN, medical: null } as unknown as Credentials;
check("no medical warns", find([flight("2026-07-20")], "medical", noMedical)?.state, "warning");
// Third class, under 40, exam Jan 2021: 60 months ran out at the end of Jan 2026.
const deadMedical = {
  ...CLEAN,
  medical: { medical_class: "Third class", exam_date: "2021-01-10", expires_date: null },
} as unknown as Credentials;
check("dead medical is critical", find([flight("2026-07-20")], "medical", deadMedical)?.state, "critical");
check("fresh medical is silent", ids([flight("2026-07-20")]).includes("medical"), false);

// --- Ordering: blockers before warnings ---
const mixed = computeActions(
  [flight("2025-01-01"), flight("2026-06-10", { approaches: 4 }), flight("2026-06-11", { holds: 1 })],
  NO_AIRCRAFT,
  dueSoon,
  NOW
);
check("criticals sort ahead of warnings", mixed[mixed.length - 1].state, "warning");
check("every critical comes first", mixed.slice(0, -1).every((a) => a.state === "critical"), true);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll planner tests passed");
if (failures) process.exit(1);

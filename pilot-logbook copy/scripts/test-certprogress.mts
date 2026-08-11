// Tests for the 61.109 / 61.65 / 61.129 / 61.159 progress figures and the
// Part 61 vs Part 141 switch.
// Run with: node scripts/test-certprogress.mts
import { evaluate, allRequirements, isMet } from "../lib/certprogress.ts";
import type { Track, Regime, Requirement } from "../lib/certprogress.ts";
import type { Flight, Aircraft } from "../lib/db.ts";
import { decodeBackup, encodeBackup, BACKUP_VERSION } from "../lib/backup.ts";
import type { BackupArchive } from "../lib/backup.ts";
import { devAccounts } from "../lib/devaccounts.ts";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) console.log(`ok   ${name}`);
  else {
    failures++;
    console.error(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}
function must(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name} ${detail}`); }
}
function near(name: string, actual: number, expected: number, tol = 0.0001) {
  if (Math.abs(actual - expected) <= tol) console.log(`ok   ${name} (${actual})`);
  else { failures++; console.error(`FAIL ${name}\n  expected ${expected} ±${tol}\n  actual   ${actual}`); }
}

function flight(tail: string, o: Partial<Flight> = {}): Flight {
  return {
    id: 0, user_id: 1, date: "2026-01-01", aircraft_type: "", tail_number: tail,
    from_airport: "", to_airport: "", route: "", total_time: 0, pic: 0, sic: 0,
    dual_received: 0, solo: 0, night: 0, cross_country: 0, actual_instrument: 0,
    simulated_instrument: 0, day_landings: 0, night_landings: 0,
    night_full_stop_landings: 0, approaches: 0, holds: 0, remarks: "",
    created_at: "", ...o,
  };
}
function craft(tail: string, cc: string, o: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 0, user_id: 1, tail_number: tail, aircraft_type: "", make_model: "",
    category_class: cc, is_complex: 0, is_high_performance: 0, is_taa: 0,
    is_tailwheel: 0, notes: "", created_at: "", ...o,
  };
}
const req = (t: Track, rg: Regime, label: string, f: Flight[] = [], a: Aircraft[] = []) =>
  allRequirements(evaluate(t, rg, f, a)).find((r) => r.label === label);

// ---- headline numbers, straight from the regulations ----
check("private: 40 hours under Part 61", req("private", "part61", "Total flight time")?.required, 40);
check("private: 35 hours of course training under Part 141",
  req("private", "part141", "Training time in the course")?.required, 35);
check("private: 20 hours of dual either way",
  req("private", "part61", "Flight training from an instructor")?.required, 20);
check("private: 10 solo under 61, 5 under 141", [
  req("private", "part61", "Solo flight training")?.required,
  req("private", "part141", "Solo flight training")?.required,
], [10, 5]);

check("instrument: 50 hours PIC cross-country under Part 61",
  req("instrument", "part61", "Cross-country PIC")?.required, 50);
check("instrument: 40 hours instrument under Part 61",
  req("instrument", "part61", "Instrument time, actual or simulated")?.required, 40);
check("instrument: 35 hours of course training under Part 141",
  req("instrument", "part141", "Instrument training in the course")?.required, 35);

check("commercial: 250 hours under Part 61",
  req("commercial", "part61", "Total flight time")?.required, 250);
// 190 is the appendix minimums for the whole course sequence added up
// (35 private + 35 instrument + 120 commercial); it appears in no single
// paragraph, and 61.129's own 190-hour credit is for part 142, not 141.
check("commercial: 190 total under Part 141",
  req("commercial", "part141", "Total flight time")?.required, 190);
check("...of which the commercial course itself is 120",
  req("commercial", "part141", "Commercial course flight training")?.required, 120);
near("...and 35 + 35 + 120 is where 190 comes from", 35 + 35 + 120, 190);
check("commercial: 55 hours of dual under Part 141",
  req("commercial", "part141", "Flight training from an instructor")?.required, 55);

check("ATP: 1500 hours", req("atp", "part61", "Total time as a pilot")?.required, 1500);
check("ATP: 500 cross-country", req("atp", "part61", "Cross-country")?.required, 500);
check("ATP: 100 night", req("atp", "part61", "Night")?.required, 100);
check("ATP: 75 instrument", req("atp", "part61", "Instrument, actual or simulated")?.required, 75);
check("ATP: 250 PIC", req("atp", "part61", "PIC time")?.required, 250);
// 61.159 is a total-time certificate; Appendix E requires the same Part 61
// experience, so the regime switch must not move these.
check("ATP is the same under Part 141",
  req("atp", "part141", "Total time as a pilot")?.required, 1500);

// ---- the arithmetic ----
const fleet = [craft("N1SEL", "ASEL", { is_taa: 1 }), craft("N2MEL", "AMEL", { is_complex: 1 })];
const flights = [
  flight("N1SEL", { total_time: 100, pic: 80, solo: 12, cross_country: 40 }),
  flight("N1SEL", { total_time: 30, dual_received: 30, simulated_instrument: 12 }),
  flight("N2MEL", { total_time: 20, dual_received: 20 }),
  flight("N1SEL", { total_time: 10, pic: 10, night: 6, night_landings: 14 }),
];
const cp = (label: string) => req("commercial", "part61", label, flights, fleet);
near("total time adds up", cp("Total flight time")!.logged, 160);
near("PIC adds up", cp("PIC time")!.logged, 90);
near("airplane time counts both classes", cp("In airplanes")!.logged, 160);
near("solo only counts the single-engine airplane", cp("Solo in a single-engine airplane")!.logged, 12);
near("complex/TAA training counts both", cp("Complex, turbine, or TAA training")!.logged, 50);
near("instrument training is bounded by the dual it was flown under",
  cp("Instrument training")!.logged, 12);
near("cross-country under the PIC heading needs PIC time", cp("PIC cross-country")!.logged, 40);
near("night landings count",
  cp("Night landings in the pattern at a towered airport")!.logged, 14);

// A tail with no profile can't be classified, and the page has to say so.
const withUnknown = evaluate("commercial", "part61",
  [...flights, flight("N9UNKNOWN", { total_time: 50, pic: 50 })], fleet);
check("flights with no aircraft profile are counted", withUnknown.unmatchedFlights, 1);
const find = (r: ProgressLike, label: string) => allRequirements(r).find((x) => x.label === label)!;
type ProgressLike = ReturnType<typeof evaluate>;
near("...their hours still reach the total", find(withUnknown, "Total flight time").logged, 210);
near("...but not the airplane-only figures", find(withUnknown, "In airplanes").logged, 160);
must("...and that requirement stops claiming to be exact",
  find(withUnknown, "In airplanes").confidence.kind === "estimated");

// Never counted as met, however much is logged.
const untracked: Requirement | undefined = cp("250 nm cross-country, 3 landings");
must("a not-tracked requirement is never met", untracked !== undefined && !isMet(untracked));

// The long dual cross-countries key off route distance, which is injected.
const longDay = flight("N1SEL", { total_time: 2.5, dual_received: 2.5, cross_country: 2.5 });
const longNight = flight("N1SEL", { total_time: 2.5, dual_received: 2.5, cross_country: 2.5, night: 2 });
const far = evaluate("commercial", "part61", [longDay, longNight], fleet, () => 140);
near("a long day cross-country is found",
  find(far, "2-hour day cross-country over 100 nm").logged, 1);
near("...and the night one separately",
  find(far, "2-hour night cross-country over 100 nm").logged, 1);
const near100 = evaluate("commercial", "part61", [longDay, longNight], fleet, () => 60);
near("under 100 nm doesn't qualify",
  find(near100, "2-hour day cross-country over 100 nm").logged, 0);
const noRoute = evaluate("commercial", "part61", [longDay], fleet);
near("an unresolvable route doesn't qualify either",
  find(noRoute, "2-hour day cross-country over 100 nm").logged, 0);

// Empty logbook: everything listed, nothing met.
for (const t of ["private", "instrument", "commercial", "atp"] as Track[]) {
  for (const rg of ["part61", "part141"] as Regime[]) {
    const empty = evaluate(t, rg, [], []);
    const all = allRequirements(empty);
    must(`${t}/${rg}: requirements are listed with no flights`, all.length >= 3, `${all.length}`);
    check(`${t}/${rg}: none are met`, all.filter(isMet).length, 0);
  }
}

// ---- backup round-trip ----
const archive: BackupArchive = {
  formatVersion: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  pilot: { name: "Test Pilot", dateOfBirth: "1992-03-04" },
  flights: [{ date: "2026-05-04", tail_number: "N2841V", total_time: 1.7, remarks: 'Quotes " and a comma, 🛩' }],
  aircraft: [{ tail_number: "N2841V", category_class: "ASEL", is_taa: 1 }],
  certificates: [{ kind: "certificate", name: "Private Pilot — ASEL" }],
  medicals: [{ medical_class: "Third class", exam_date: "2026-02-01" }],
  endorsements: [{ endorsement_type: "Flight review — 61.56(a)", date: "2025-11-02" }],
  bookmarkGroups: ["Checkride prep", "Night ops"],
  bookmarks: [{ source: "FAR", citation: "14 CFR 61.57", name: "Night currency", groups: ["Checkride prep", "Night ops"] }],
};
const round = decodeBackup(encodeBackup(archive));
check("a backup round-trips", round, archive);
must("...as readable JSON", encodeBackup(archive).includes('"formatVersion"'));

must("junk is refused", (() => { try { decodeBackup("not a backup"); return false; } catch { return true; } })());
must("an empty file is refused", (() => { try { decodeBackup(""); return false; } catch { return true; } })());
must("a newer format is refused rather than half-read", (() => {
  try { decodeBackup(JSON.stringify({ ...archive, formatVersion: BACKUP_VERSION + 1 })); return false; }
  catch { return true; }
})());

// ---- developer fixtures ----
const accounts = devAccounts();
must("there are fixtures to pick from", accounts.length >= 4, `${accounts.length}`);
check("...with unique names", new Set(accounts.map((a) => a.name)).size, accounts.length);
must("...each one described", accounts.every((a) => a.summary.length > 0));
const twice = devAccounts();
check("building a fixture twice gives the same logbook",
  JSON.stringify(accounts.map((a) => a.flights.length)),
  JSON.stringify(twice.map((a) => a.flights.length)));
const test = accounts.find((a) => a.name === "Test Pilot")!;
must("Test Pilot has flights", test.flights.length > 0);
must("...every flight has hours", test.flights.every((f) => f.total_time > 0));
must("...and every tail has a profile", (() => {
  const known = new Set(test.aircraft.map((a) => a.tail_number));
  return test.flights.every((f) => known.has(f.tail_number));
})());
must("night never exceeds total", test.flights.every((f) => f.night <= f.total_time));
check("Fresh Start really is empty",
  accounts.find((a) => a.name === "Fresh Start")!.flights.length, 0);
const high = accounts.find((a) => a.name === "High Time")!;
must("High Time stresses the charts", high.flights.length > 500, `${high.flights.length}`);

console.log(failures === 0 ? "\nAll certificate-progress tests passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

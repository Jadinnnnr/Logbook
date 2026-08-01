// Tests for the 61.56 flight-review reset rules and the 61.23(d) medical
// privilege durations. Run with: node scripts/test-currency.mts
import { pickReviewReset, endorsementResetsReview } from "../lib/db.ts";
import { medicalPrivileges, reached40ByExam } from "../lib/medical.ts";

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

// --- Which endorsements substitute for a flight review (61.56(d)/(e)) ---
check("flight review resets", endorsementResetsReview("Flight review (61.56)"), true);
check("61.58 proficiency check resets", endorsementResetsReview("Pilot proficiency check (61.58)"), true);
check("WINGS phase resets", endorsementResetsReview("WINGS phase completion (61.56(e))"), true);
// An IPC restores instrument currency but is not a check for a certificate or
// rating, so it must NOT reset the review despite containing "proficiency check".
check("IPC does NOT reset", endorsementResetsReview("Instrument proficiency check (61.57(d))"), false);
check("bare IPC does NOT reset", endorsementResetsReview("IPC with John Smith"), false);
check("complex endorsement does NOT reset", endorsementResetsReview("Complex airplane (61.31(e))"), false);
check("tailwheel does NOT reset", endorsementResetsReview("Tailwheel (61.31(i))"), false);

// --- Most recent qualifying event wins ---
const review2024 = { endorsement_type: "Flight review (61.56)", date: "2024-05-10" };
const ipc2026 = { endorsement_type: "Instrument proficiency check (61.57(d))", date: "2026-06-01" };
const instrument2026 = { name: "Instrument — Airplane", issued_date: "2026-02-20", resets_flight_review: 1 };
const part107 = { name: "Remote Pilot (Part 107)", issued_date: "2026-07-01", resets_flight_review: 0 };

check(
  "checkride newer than review wins",
  pickReviewReset([review2024], [instrument2026]),
  { date: "2026-02-20", label: "Instrument — Airplane practical test" }
);
check(
  "older checkride loses to newer review",
  pickReviewReset([{ endorsement_type: "Flight review (61.56)", date: "2026-09-01" }], [instrument2026]),
  { date: "2026-09-01", label: "Flight review (61.56)" }
);
check(
  "a newer IPC does not displace the real reset",
  pickReviewReset([review2024, ipc2026], [instrument2026]),
  { date: "2026-02-20", label: "Instrument — Airplane practical test" }
);
check(
  "Part 107 (no practical test) is ignored",
  pickReviewReset([review2024], [part107]),
  { date: "2024-05-10", label: "Flight review (61.56)" }
);
check("nothing on file", pickReviewReset([], []), null);
check(
  "certificate without an issue date is ignored",
  pickReviewReset([], [{ name: "Private Pilot", issued_date: "", resets_flight_review: 1 }]),
  null
);

// --- 61.23(d) medical privilege durations ---
const under40 = "1995-08-15"; // turns 40 in 2035
const over40 = "1975-01-10"; // turned 40 in 2015
const NOW = new Date("2026-07-30T12:00:00");

const firstUnder = medicalPrivileges({ medical_class: "First class", exam_date: "2026-03-04" }, under40, NOW)!;
check(
  "first class under 40: ATP 12 months, commercial 12, private 60",
  firstUnder.map((t) => [t.label, t.expires]),
  [
    ["ATP / First Class", "2027-03-31"],
    ["Commercial", "2027-03-31"],
    ["Private / Recreational / Student / Sport / CFI", "2031-03-31"],
  ]
);

const firstOver = medicalPrivileges({ medical_class: "First class", exam_date: "2026-03-04" }, over40, NOW)!;
check(
  "first class 40+: ATP 6 months, commercial 12, private 24",
  firstOver.map((t) => [t.label, t.expires]),
  [
    ["ATP / First Class", "2026-09-30"],
    ["Commercial", "2027-03-31"],
    ["Private / Recreational / Student / Sport / CFI", "2028-03-31"],
  ]
);
// A 40+ first class examined 11 months ago: ATP privileges gone, commercial and
// private still good — the case that motivated this feature.
const lapsedAtp = medicalPrivileges({ medical_class: "First class", exam_date: "2025-08-20" }, over40, NOW)!;
check("40+ first class at 11 months: ATP lapsed, lower tiers valid",
  lapsedAtp.map((t) => t.valid), [false, true, true]);

// The user's example: a first class from 2 months ago leaves 10 months of first
// class privileges (to the end of the 12th month after the exam month).
const twoMonthsAgo = medicalPrivileges({ medical_class: "First class", exam_date: "2026-05-20" }, under40, NOW)!;
check("first class from 2 months ago still has ATP privileges", twoMonthsAgo[0].valid, true);
check("...expiring at the end of the 12th month after the exam", twoMonthsAgo[0].expires, "2027-05-31");

check(
  "second class 40+: commercial 12, private 24",
  medicalPrivileges({ medical_class: "Second class", exam_date: "2026-03-04" }, over40, NOW)!.map((t) => t.expires),
  ["2027-03-31", "2028-03-31"]
);
check(
  "third class under 40: single 60-month tier",
  medicalPrivileges({ medical_class: "Third class", exam_date: "2026-03-04" }, under40, NOW)!.map((t) => t.expires),
  ["2031-03-31"]
);
check(
  "BasicMed has no 61.23(d) ladder",
  medicalPrivileges({ medical_class: "BasicMed", exam_date: "2026-03-04" }, under40, NOW),
  null
);
check(
  "no tiers without a date of birth",
  medicalPrivileges({ medical_class: "First class", exam_date: "2026-03-04" }, null, NOW),
  null
);
check(
  "no tiers without an exam date",
  medicalPrivileges({ medical_class: "First class", exam_date: "" }, under40, NOW),
  null
);
// Turning 40 the day after the exam still counts as under 40 for that exam.
check(
  "40th birthday one day after the exam counts as under 40",
  reached40ByExam("1986-03-05", "2026-03-04"),
  false
);
check("40th birthday on the exam date counts as 40 or over", reached40ByExam("1986-03-04", "2026-03-04"), true);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll currency rule tests passed");
if (failures) process.exit(1);

/**
 * Progress toward the aeronautical experience for a certificate or rating.
 *
 * The planner answers "what do I need to stay current". This answers "what do I
 * still need for the next certificate", which is the other half of the same
 * question and the one a logbook can actually add up.
 *
 * **Every figure here is a reading of what was logged, not a determination that
 * a requirement is met.** A logbook records hours and landings; the regulations
 * also ask about areas of operation, control towers, and what an instructor
 * intended a flight to be. Each requirement therefore carries a confidence, and
 * the page shows it — a green bar that turns out to have been a guess is worse
 * than no bar at all.
 *
 * Ported from the iOS app's `Logic/CertificateProgress.swift`, requirement for
 * requirement, so the two can be diffed when the regulations change.
 */
import type { Flight, Aircraft } from "./db.ts";

export type Track = "private" | "instrument" | "commercial" | "atp";
export type Regime = "part61" | "part141";

export const TRACKS: [Track, string][] = [
  ["private", "Private"],
  ["instrument", "Instrument"],
  ["commercial", "Commercial"],
  ["atp", "ATP"],
];

export type Confidence =
  | { kind: "exact" }
  | { kind: "estimated"; why: string }
  | { kind: "notTracked"; why: string };

export const EXACT: Confidence = { kind: "exact" };
const est = (why: string): Confidence => ({ kind: "estimated", why });
const untracked = (why: string): Confidence => ({ kind: "notTracked", why });

export type Unit = "hours" | "flights" | "landings";

export interface Requirement {
  label: string;
  reference: string;
  required: number;
  logged: number;
  unit: Unit;
  confidence: Confidence;
}

export interface Group {
  title: string;
  requirements: Requirement[];
}

export interface ProgressResult {
  groups: Group[];
  /** Flights whose tail matches no aircraft profile. */
  unmatchedFlights: number;
}

export function isMet(r: Requirement): boolean {
  if (r.confidence.kind === "notTracked") return false;
  return r.logged + 0.0001 >= r.required;
}

export function fraction(r: Requirement): number {
  if (r.required <= 0) return 1;
  return Math.min(1, Math.max(0, r.logged / r.required));
}

export function remaining(r: Requirement): number {
  return Math.max(0, r.required - r.logged);
}

export function allRequirements(result: ProgressResult): Requirement[] {
  return result.groups.flatMap((g) => g.requirements);
}

/** ATP is a total-time certificate; the rest are training certificates. */
export function evaluate(
  track: Track,
  regime: Regime,
  flights: Flight[],
  aircraft: Aircraft[],
  straightLineNm: (f: Flight) => number | null = () => null
): ProgressResult {
  const byTail = new Map(aircraft.map((a) => [a.tail_number.toUpperCase(), a]));
  const profile = (f: Flight) => byTail.get(f.tail_number.toUpperCase());
  const isAirplane = (f: Flight) => (profile(f)?.category_class ?? "").toUpperCase().startsWith("A");
  const isSingleEngine = (f: Flight) => {
    const c = (profile(f)?.category_class ?? "").toUpperCase();
    return c === "ASEL" || c === "ASES";
  };
  const isComplexish = (f: Flight) => {
    const a = profile(f);
    return !!a && (a.is_complex === 1 || a.is_taa === 1);
  };

  const unmatched = flights.filter((f) => f.tail_number && !profile(f)).length;
  const profileNote: Confidence =
    unmatched === 0
      ? EXACT
      : est(
          `${unmatched} flight${unmatched === 1 ? "" : "s"} have no aircraft profile, so this is ` +
            "a floor — add the missing tail numbers under Aircraft."
        );

  function sum(f: (x: Flight) => number): number {
    return flights.reduce((t, x) => t + f(x), 0);
  }
  const instrumentOnDual = (f: Flight) =>
    f.dual_received > 0
      ? Math.min(f.dual_received, f.actual_instrument + f.simulated_instrument)
      : 0;

  const m = {
    total: sum((f) => f.total_time),
    pic: sum((f) => f.pic),
    dual: sum((f) => f.dual_received),
    night: sum((f) => f.night),
    xc: sum((f) => f.cross_country),
    picXc: sum((f) => (f.pic > 0 ? f.cross_country : 0)),
    picXcAirplane: sum((f) => (f.pic > 0 && isAirplane(f) ? f.cross_country : 0)),
    instrument: sum((f) => f.actual_instrument + f.simulated_instrument),
    instrumentTraining: sum(instrumentOnDual),
    instrumentSel: sum((f) => (isSingleEngine(f) ? instrumentOnDual(f) : 0)),
    complexTraining: sum((f) => (isComplexish(f) ? f.dual_received : 0)),
    airplane: sum((f) => (isAirplane(f) ? f.total_time : 0)),
    picAirplane: sum((f) => (isAirplane(f) ? f.pic : 0)),
    soloSel: sum((f) => (isSingleEngine(f) ? f.solo : 0)),
    dualSel: sum((f) => (isSingleEngine(f) ? f.dual_received : 0)),
    nightDualSel: sum((f) => (isSingleEngine(f) && f.dual_received > 0 ? f.night : 0)),
    xcDualSel: sum((f) => (isSingleEngine(f) && f.dual_received > 0 ? f.cross_country : 0)),
    soloXcSel: sum((f) => (isSingleEngine(f) && f.solo > 0 ? f.cross_country : 0)),
    nightLandings: sum((f) => f.night_landings),
    powered: sum((f) => {
      const c = (profile(f)?.category_class ?? "").toUpperCase();
      return c.startsWith("GL") || c.startsWith("BAL") ? 0 : f.total_time;
    }),
  };

  const routeNote = est(
    "matched on route distance and whether any night time was logged; the logbook doesn't " +
      "record daylight or the instructor's intent."
  );
  const longXc = (atNight: boolean, minHours: number) =>
    flights.filter((f) => {
      if (f.total_time < minHours || !isSingleEngine(f)) return false;
      const d = straightLineNm(f);
      if (d === null || d <= 100) return false;
      return atNight ? f.night > 0 : f.night === 0;
    }).length;

  const is141 = regime === "part141";
  const groups: Group[] = [];

  if (track === "private") {
    groups.push({
      title: "Overall",
      requirements: is141
        ? [
            {
              label: "Training time in the course",
              reference: "141 App. B §4(a)(1)",
              required: 35,
              logged: m.total,
              unit: "hours",
              confidence: est(
                "nothing marks which hours were flown inside the approved course, so every " +
                  "logged hour is counted toward it."
              ),
            },
            {
              label: "Flight training from an instructor",
              reference: "141 App. B §4(b)(1)",
              required: 20,
              logged: m.dual,
              unit: "hours",
              confidence: est("counted as dual received."),
            },
            {
              label: "Solo flight training",
              reference: "141 App. B §5(a)",
              required: 5,
              logged: m.soloSel,
              unit: "hours",
              confidence: profileNote,
            },
          ]
        : [
            {
              label: "Total flight time",
              reference: "61.109(a)",
              required: 40,
              logged: m.total,
              unit: "hours",
              confidence: EXACT,
            },
            {
              label: "Flight training from an instructor",
              reference: "61.109(a)",
              required: 20,
              logged: m.dual,
              unit: "hours",
              confidence: est("counted as dual received."),
            },
            {
              label: "Solo flight training",
              reference: "61.109(a)",
              required: 10,
              logged: m.soloSel,
              unit: "hours",
              confidence: profileNote,
            },
          ],
    });
    groups.push({
      title: "Training received",
      requirements: [
        {
          label: "Cross-country training",
          reference: is141 ? "141 App. B §4(b)(1)(i)" : "61.109(a)(1)",
          required: 3,
          logged: m.xcDualSel,
          unit: "hours",
          confidence: est("cross-country hours on flights with dual received."),
        },
        {
          label: "Night training",
          reference: is141 ? "141 App. B §4(b)(1)(ii)" : "61.109(a)(2)",
          required: 3,
          logged: m.nightDualSel,
          unit: "hours",
          confidence: est("night hours on flights with dual received."),
        },
        {
          label: "Night cross-country over 100 nm",
          reference: is141 ? "141 App. B §4(b)(1)(ii)(A)" : "61.109(a)(2)(i)",
          required: 1,
          logged: longXc(true, 0),
          unit: "flights",
          confidence: routeNote,
        },
        {
          label: "Night take-offs and landings to a full stop",
          reference: is141 ? "141 App. B §4(b)(1)(ii)(B)" : "61.109(a)(2)(ii)",
          required: 10,
          logged: m.nightLandings,
          unit: "landings",
          confidence: est("all night landings; the traffic pattern isn't recorded."),
        },
        {
          label: "Instrument training",
          reference: is141 ? "141 App. B §4(b)(1)(iii)" : "61.109(a)(3)",
          required: 3,
          logged: m.instrumentTraining,
          unit: "hours",
          confidence: est("instrument time logged on flights with dual received."),
        },
        {
          label: is141
            ? "Test preparation in the last 60 days"
            : "Test preparation in the last 2 calendar months",
          reference: is141 ? "141 App. B §4(b)(1)(iv)" : "61.109(a)(4)",
          required: 3,
          logged: 0,
          unit: "hours",
          confidence: untracked(
            "nothing marks a flight as practical-test preparation, and it only counts in the " +
              "window before the test."
          ),
        },
      ],
    });
    groups.push({
      title: "Solo",
      requirements: [
        {
          label: "Solo cross-country",
          reference: is141 ? "141 App. B §5(a)" : "61.109(a)(5)(i)",
          required: is141 ? 1 : 5,
          logged: is141 ? 0 : m.soloXcSel,
          unit: is141 ? "flights" : "hours",
          confidence: is141
            ? untracked(
                "the 100 nm solo cross-country needs landings recorded against the airports " +
                  "they happened at."
              )
            : est("cross-country hours on flights with solo time."),
        },
        {
          label: is141
            ? "Solo 100 nm cross-country, 3 points, one 50 nm leg"
            : "Solo 150 nm cross-country, 3 points, one 50 nm leg",
          reference: is141 ? "141 App. B §5(a)(1)" : "61.109(a)(5)(ii)",
          required: 1,
          logged: 0,
          unit: "flights",
          confidence: untracked(
            "landings aren't recorded against the airports they happened at, so the three " +
              "points and the leg length can't be confirmed from what's logged."
          ),
        },
        {
          label: "Take-offs and landings at a towered airport",
          reference: is141 ? "141 App. B §5(a)(2)" : "61.109(a)(5)(iii)",
          required: 3,
          logged: 0,
          unit: "landings",
          confidence: untracked(
            "whether the airport had an operating control tower isn't recorded."
          ),
        },
      ],
    });
  }

  if (track === "instrument") {
    groups.push({
      title: "Overall",
      requirements: is141
        ? [
            {
              label: "Instrument training in the course",
              reference: "141 App. C §4(a)(1)",
              required: 35,
              logged: m.instrumentTraining,
              unit: "hours",
              confidence: est("instrument time logged on flights with dual received."),
            },
          ]
        : [
            {
              label: "Cross-country PIC",
              reference: "61.65(d)(2)",
              required: 50,
              logged: m.picXc,
              unit: "hours",
              confidence: est(
                "cross-country hours on flights with PIC time; the two are logged per flight, " +
                  "not per hour."
              ),
            },
            {
              label: "…of that, in airplanes",
              reference: "61.65(d)(2)(i)",
              required: 10,
              logged: m.picXcAirplane,
              unit: "hours",
              confidence: profileNote,
            },
            {
              label: "Instrument time, actual or simulated",
              reference: "61.65(d)(3)",
              required: 40,
              logged: m.instrument,
              unit: "hours",
              confidence: EXACT,
            },
            {
              label: "…of that, training from an instructor",
              reference: "61.65(d)(3)(i)",
              required: 15,
              logged: m.instrumentTraining,
              unit: "hours",
              confidence: est("instrument time logged on flights with dual received."),
            },
          ],
    });
    groups.push({
      title: "The instrument cross-country",
      requirements: [
        {
          label: "250 nm IFR cross-country with three kinds of approach",
          reference: is141 ? "141 App. C §4(c)(1)" : "61.65(d)(2)(ii)",
          required: 1,
          logged: 0,
          unit: "flights",
          confidence: untracked(
            "approaches are logged as a count, not by type or airport, and nothing records " +
              "whether a flight was conducted under IFR."
          ),
        },
        {
          label: is141
            ? "Instrument training in the last 60 days"
            : "Instrument training in the last 2 calendar months",
          reference: is141 ? "141 App. C" : "61.65(d)(4)",
          required: 3,
          logged: 0,
          unit: "hours",
          confidence: untracked(
            "nothing marks a flight as practical-test preparation, and it only counts in the " +
              "window before the test."
          ),
        },
      ],
    });
    groups.push({
      title: "Supporting totals",
      requirements: [
        {
          label: "Total instrument approaches logged",
          reference: "—",
          required: 1,
          logged: sum((f) => f.approaches),
          unit: "landings",
          confidence: est("a count with no bearing on a specific requirement; shown for context."),
        },
      ],
    });
  }

  if (track === "commercial") {
    const overall: Requirement[] = [];
    if (is141) {
      // 190 is the figure schools quote, and it isn't in any single paragraph:
      // it's the three appendix minimums for the course sequence added
      // together. Showing the commercial course's own 120 hours as the headline
      // compares a course flight-training minimum against Part 61's total
      // aeronautical experience, which are different quantities.
      overall.push({
        label: "Total flight time",
        reference: "141 App. B + C + D",
        required: 190,
        logged: m.total,
        unit: "hours",
        confidence: est(
          "the Part 141 sequence added up — 35 hours for the private course, 35 for the " +
            "instrument, and 120 for the commercial. No paragraph states 190; Part 141 never " +
            "gives a total, and 61.129's own 190-hour credit is for a part 142 course, not a " +
            "part 141 one."
        ),
      });
      overall.push({
        label: "Commercial course flight training",
        reference: "141 App. D §4(a)(1)",
        required: 120,
        logged: m.total,
        unit: "hours",
        confidence: est(
          "nothing marks which hours were flown inside the approved course, so every logged " +
            "hour is counted toward it."
        ),
      });
      overall.push({
        label: "Flight training from an instructor",
        reference: "141 App. D §4(b)(1)",
        required: 55,
        logged: m.dual,
        unit: "hours",
        confidence: est("counted as dual received."),
      });
    } else {
      overall.push({
        label: "Total flight time",
        reference: "61.129(a)",
        required: 250,
        logged: m.total,
        unit: "hours",
        confidence: EXACT,
      });
      overall.push({
        label: "In powered aircraft",
        reference: "61.129(a)(1)",
        required: 100,
        logged: m.powered,
        unit: "hours",
        confidence: EXACT,
      });
      overall.push({
        label: "In airplanes",
        reference: "61.129(a)(1)",
        required: 50,
        logged: m.airplane,
        unit: "hours",
        confidence: profileNote,
      });
      overall.push({
        label: "PIC time",
        reference: "61.129(a)(2)",
        required: 100,
        logged: m.pic,
        unit: "hours",
        confidence: EXACT,
      });
      overall.push({
        label: "PIC in airplanes",
        reference: "61.129(a)(2)(i)",
        required: 50,
        logged: m.picAirplane,
        unit: "hours",
        confidence: profileNote,
      });
      overall.push({
        label: "PIC cross-country",
        reference: "61.129(a)(2)(ii)",
        required: 50,
        logged: m.picXc,
        unit: "hours",
        confidence: est(
          "cross-country hours on flights with PIC time; the two are logged per flight, not " +
            "per hour."
        ),
      });
      overall.push({
        label: "…of that, in airplanes",
        reference: "61.129(a)(2)(ii)",
        required: 10,
        logged: m.picXcAirplane,
        unit: "hours",
        confidence: profileNote,
      });
    }
    groups.push({ title: "Overall", requirements: overall });

    groups.push({
      title: "Training received",
      requirements: [
        ...(is141
          ? []
          : [
              {
                label: "Training on the areas of operation",
                reference: "61.129(a)(3)",
                required: 20,
                logged: m.dual,
                unit: "hours" as Unit,
                confidence: est(
                  "counted as dual received; the logbook doesn't record which areas of " +
                    "operation a lesson covered."
                ),
              },
            ]),
        {
          label: "Instrument training",
          reference: is141 ? "141 App. D §4(b)(1)(i)" : "61.129(a)(3)(i)",
          required: 10,
          logged: m.instrumentTraining,
          unit: "hours",
          confidence: est("instrument time logged on flights with dual received."),
        },
        {
          label: "…of that, in a single-engine airplane",
          reference: is141 ? "141 App. D §4(b)(1)(i)" : "61.129(a)(3)(i)",
          required: 5,
          logged: m.instrumentSel,
          unit: "hours",
          confidence: profileNote,
        },
        {
          label: "Complex, turbine, or TAA training",
          reference: is141 ? "141 App. D §4(b)(1)(ii)" : "61.129(a)(3)(ii)",
          required: 10,
          logged: m.complexTraining,
          unit: "hours",
          confidence: est(
            "dual in aircraft flagged complex or TAA. Turbine isn't a flag on the aircraft " +
              "profile, so turbine time isn't counted."
          ),
        },
        {
          label: "2-hour day cross-country over 100 nm",
          reference: is141 ? "141 App. D §4(b)(1)(iii)" : "61.129(a)(3)(iii)",
          required: 1,
          logged: longXc(false, 2),
          unit: "flights",
          confidence: routeNote,
        },
        {
          label: "2-hour night cross-country over 100 nm",
          reference: is141 ? "141 App. D §4(b)(1)(iv)" : "61.129(a)(3)(iv)",
          required: 1,
          logged: longXc(true, 2),
          unit: "flights",
          confidence: routeNote,
        },
        {
          label: is141
            ? "Test preparation in the last 60 days"
            : "Test preparation in the last 2 calendar months",
          reference: is141 ? "141 App. D §4(b)(1)(v)" : "61.129(a)(3)(v)",
          required: 3,
          logged: 0,
          unit: "hours",
          confidence: untracked(
            "nothing marks a flight as practical-test preparation, and it only counts in the " +
              "window before the test."
          ),
        },
      ],
    });

    groups.push({
      title: "Solo, or PIC duties with an instructor",
      requirements: [
        {
          label: "Solo in a single-engine airplane",
          reference: is141 ? "141 App. D §5(a)" : "61.129(a)(4)",
          required: 10,
          logged: m.soloSel,
          unit: "hours",
          confidence: profileNote,
        },
        {
          label: "250 nm cross-country, 3 landings",
          reference: is141 ? "141 App. D §5(a)(2)" : "61.129(a)(4)(i)",
          required: 1,
          logged: 0,
          unit: "flights",
          confidence: untracked(
            "landings aren't recorded against the airports they happened at, so the three " +
              "points and the 250 nm leg can't be confirmed from what's logged."
          ),
        },
        {
          label: "Night VFR",
          reference: is141 ? "141 App. D §5(a)(3)" : "61.129(a)(4)(ii)",
          required: 5,
          logged: m.night,
          unit: "hours",
          confidence: est("all night time; the logbook doesn't separate VFR from IFR."),
        },
        {
          label: "Night landings in the pattern at a towered airport",
          reference: is141 ? "141 App. D §5(a)(3)" : "61.129(a)(4)(ii)",
          required: 10,
          logged: m.nightLandings,
          unit: "landings",
          confidence: est(
            "all night landings; whether the airport had an operating control tower isn't " +
              "recorded."
          ),
        },
      ],
    });
  }

  if (track === "atp") {
    // 61.159 is a total-time certificate — Part 141 Appendix E requires the
    // same Part 61 aeronautical experience before the course can be finished,
    // so the figures don't change between regimes.
    groups.push({
      title: "Total experience",
      requirements: [
        {
          label: "Total time as a pilot",
          reference: "61.159(a)",
          required: 1500,
          logged: m.total,
          unit: "hours",
          confidence: EXACT,
        },
        {
          label: "Cross-country",
          reference: "61.159(a)(1)",
          required: 500,
          logged: m.xc,
          unit: "hours",
          confidence: EXACT,
        },
        {
          label: "Night",
          reference: "61.159(a)(2)",
          required: 100,
          logged: m.night,
          unit: "hours",
          confidence: EXACT,
        },
        {
          label: "In the class of airplane for the rating",
          reference: "61.159(a)(3)",
          required: 50,
          logged: m.airplane,
          unit: "hours",
          confidence: est(
            "all airplane time. The requirement is for the specific class being rated, which " +
              "depends on the checkride, not the logbook."
          ),
        },
        {
          label: "Instrument, actual or simulated",
          reference: "61.159(a)(4)",
          required: 75,
          logged: m.instrument,
          unit: "hours",
          confidence: est(
            "all instrument time. Simulator credit is capped at 25 hours (50 in a part 142 " +
              "course), and the logbook doesn't separate simulator time from aircraft time."
          ),
        },
      ],
    });
    groups.push({
      title: "Pilot in command",
      requirements: [
        {
          label: "PIC time",
          reference: "61.159(a)(5)",
          required: 250,
          logged: m.pic,
          unit: "hours",
          confidence: EXACT,
        },
        {
          label: "…of that, cross-country",
          reference: "61.159(a)(5)(i)",
          required: 100,
          logged: m.picXc,
          unit: "hours",
          confidence: est("cross-country hours on flights with PIC time."),
        },
        {
          label: "…of that, night",
          reference: "61.159(a)(5)(ii)",
          required: 25,
          logged: sum((f) => (f.pic > 0 ? f.night : 0)),
          unit: "hours",
          confidence: est("night hours on flights with PIC time."),
        },
      ],
    });
    groups.push({
      title: "Reduced minimums",
      requirements: [
        {
          label: "Restricted ATP — check your eligibility",
          reference: "61.160",
          required: 1,
          logged: 0,
          unit: "flights",
          confidence: untracked(
            "61.160 lowers the 1,500 hours to 1,000 with a qualifying bachelor's degree, 1,250 " +
              "with an associate's, or 750 for military pilots. None of that is in a logbook."
          ),
        },
      ],
    });
  }

  return { groups, unmatchedFlights: unmatched };
}

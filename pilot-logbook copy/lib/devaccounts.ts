/**
 * Canned logbooks for exercising the app against data that isn't yours.
 *
 * Building an account touches nothing — these are values. `replaceLogbook` in
 * actions.ts is what writes one to the current pilot's rows.
 *
 * Each account exists to put some part of the app into a state that's otherwise
 * tedious to reach by hand: an expired medical, an empty logbook, a thousand
 * flights in the stats charts. Dates are generated relative to the moment the
 * account is built, so "current" accounts stay current however long this build
 * sits on the server.
 *
 * Ported from the iOS app's `Logic/DeveloperAccounts.swift`.
 */

export interface DevFlight {
  date: string;
  aircraft_type: string;
  tail_number: string;
  from_airport: string;
  to_airport: string;
  route: string;
  total_time: number;
  pic: number;
  sic: number;
  dual_received: number;
  solo: number;
  night: number;
  cross_country: number;
  actual_instrument: number;
  simulated_instrument: number;
  day_landings: number;
  night_landings: number;
  night_full_stop_landings: number;
  approaches: number;
  holds: number;
  remarks: string;
}

export interface DevAircraft {
  tail_number: string;
  aircraft_type: string;
  make_model: string;
  category_class: string;
  is_complex: number;
  is_high_performance: number;
  is_taa: number;
  is_tailwheel: number;
  notes: string;
}

export interface DevAccount {
  name: string;
  /** What this account is *for* — shown under its name in the picker. */
  summary: string;
  dateOfBirth: string;
  flights: DevFlight[];
  aircraft: DevAircraft[];
  certificates: { kind: string; name: string; number: string; issued_date: string }[];
  medicals: { medical_class: string; exam_date: string; expires_date: string; examiner: string }[];
  endorsements: {
    endorsement_type: string;
    date: string;
    instructor_name: string;
    instructor_cert: string;
  }[];
}

function iso(daysAgo: number, now: Date): string {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** End of the nth calendar month after a date, as the medical rules count it. */
function endOfMonths(from: string, months: number): string {
  const [y, m] = from.split("-").map(Number);
  const d = new Date(y, m - 1 + months + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * A fixed-seed generator, so an account's logbook is identical every time it's
 * loaded. A test account that shuffled under you would be no use for comparing
 * a screen before and after a change.
 */
class Seeded {
  private state: bigint;
  constructor(seed: number) {
    this.state = (BigInt(seed) * 2862933555777941757n + 3037000493n) & 0xffffffffffffffffn;
  }
  private next(): number {
    this.state =
      (this.state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    return Number(this.state >> 16n) % 1000000;
  }
  int(lo: number, hi: number): number {
    return lo + (this.next() % (hi - lo + 1));
  }
  pick<T>(items: T[]): T {
    return items[this.int(0, items.length - 1)];
  }
  chance(p: number): boolean {
    return this.next() % 1000 < p * 1000;
  }
  hours(lo: number, hi: number): number {
    const steps = Math.max(1, Math.round((hi - lo) * 10));
    return Math.round((lo + this.int(0, steps) / 10) * 10) / 10;
  }
}

const AIRPORTS = [
  "KPAO", "KSQL", "KHAF", "KWVI", "KSNS", "KMRY", "KRHV", "KLVK",
  "KCCR", "KSTS", "KOAK", "KSJC", "KTCY", "KMOD", "KSCK", "KPRB",
];

const REMARKS = [
  "Pattern work", "Bay tour", "Coastal VFR", "Practice area — steep turns and stalls",
  "ILS 30L, circling", "Night currency", "$100 hamburger", "Instrument approaches",
  "Hood work with safety pilot", "Short and soft field", "Mountain checkout",
  "Cross-country", "Class B transition", "Simulated engine out", "",
];

function craft(
  tail: string,
  type: string,
  makeModel: string,
  opts: { cc?: string; complex?: boolean; hp?: boolean; taa?: boolean; tw?: boolean } = {}
): DevAircraft {
  return {
    tail_number: tail,
    aircraft_type: type,
    make_model: makeModel,
    category_class: opts.cc ?? "ASEL",
    is_complex: opts.complex ? 1 : 0,
    is_high_performance: opts.hp ? 1 : 0,
    is_taa: opts.taa ? 1 : 0,
    is_tailwheel: opts.tw ? 1 : 0,
    notes: "",
  };
}

function generate(
  seed: number,
  count: number,
  spanDays: number,
  mostRecentDaysAgo: number,
  fleet: DevAircraft[],
  now: Date,
  shares: { dual: number; instrument: number; night: number; solo: number }
): DevFlight[] {
  if (count <= 0 || fleet.length === 0) return [];
  const rng = new Seeded(seed);
  const out: DevFlight[] = [];

  for (let i = 0; i < count; i++) {
    const progress = count === 1 ? 0 : i / (count - 1);
    const daysAgo = Math.max(0, mostRecentDaysAgo + Math.round(progress * spanDays) + rng.int(-3, 3));
    const a = rng.pick(fleet);
    const from = rng.pick(AIRPORTS);
    let to = rng.pick(AIRPORTS);
    if (rng.chance(0.35)) to = from; // stayed in the pattern

    const total = rng.hours(0.6, from === to ? 1.6 : 2.8);
    const f: DevFlight = {
      date: iso(daysAgo, now),
      aircraft_type: a.aircraft_type,
      tail_number: a.tail_number,
      from_airport: from,
      to_airport: to,
      route: from === to ? "" : `${from} ${to}`,
      total_time: total,
      pic: 0, sic: 0, dual_received: 0, solo: 0, night: 0, cross_country: 0,
      actual_instrument: 0, simulated_instrument: 0,
      day_landings: 0, night_landings: 0, night_full_stop_landings: 0,
      approaches: 0, holds: 0,
      remarks: rng.pick(REMARKS),
    };

    // One role per flight, as a logbook reads.
    if (rng.chance(shares.dual)) f.dual_received = total;
    else if (rng.chance(shares.solo)) { f.solo = total; f.pic = total; }
    else f.pic = total;

    if (from !== to && total >= 1.2 && rng.chance(0.55)) f.cross_country = total;

    const atNight = rng.chance(shares.night);
    if (atNight) f.night = Math.round(total * 0.7 * 10) / 10;

    const landings = from === to ? rng.int(3, 9) : rng.int(1, 2);
    if (atNight) {
      f.night_landings = landings;
      f.night_full_stop_landings = Math.min(landings, rng.int(1, 3));
    } else {
      f.day_landings = landings;
    }

    if (rng.chance(shares.instrument)) {
      const hood = rng.hours(0.3, Math.min(total, 1.4));
      if (rng.chance(0.3)) f.actual_instrument = hood;
      else f.simulated_instrument = hood;
      f.approaches = rng.int(1, 4);
      if (rng.chance(0.4)) f.holds = 1;
    }

    out.push(f);
  }
  return out;
}

export function devAccounts(now: Date = new Date()): DevAccount[] {
  const archer = craft("N2841V", "PA28", "Piper PA-28-181 Archer III", { taa: true });
  const skyhawk = craft("N7382Q", "C172", "Cessna 172S Skyhawk", { taa: true });
  const bonanza = craft("N556KT", "BE33", "Beechcraft F33A Bonanza", { complex: true, hp: true });
  const c152 = craft("N4419H", "C152", "Cessna 152");

  return [
    {
      name: "Test Pilot",
      summary: "Instrument-rated PPL, current on everything. The everyday case.",
      dateOfBirth: iso(34 * 365 + 88, now),
      aircraft: [archer, skyhawk, bonanza],
      flights: generate(1, 86, 1180, 4, [archer, skyhawk, bonanza], now, {
        dual: 0.18, instrument: 0.3, night: 0.16, solo: 0,
      }),
      certificates: [
        { kind: "certificate", name: "Private Pilot — Airplane Single-Engine Land", number: "3921847", issued_date: iso(1090, now) },
        { kind: "rating", name: "Instrument — Airplane", number: "", issued_date: iso(430, now) },
      ],
      medicals: [{ medical_class: "Third class", exam_date: iso(190, now), expires_date: endOfMonths(iso(190, now), 60), examiner: "AME" }],
      endorsements: [
        { endorsement_type: "Flight review — 61.56(a)", date: iso(240, now), instructor_name: "M. Okonkwo", instructor_cert: "3184920CFII" },
        { endorsement_type: "Complex aircraft — 61.31(e)", date: iso(610, now), instructor_name: "M. Okonkwo", instructor_cert: "3184920CFII" },
      ],
    },
    {
      name: "StxxzyHB",
      summary: "Student pilot, pre-checkride. Mostly dual, solo endorsement live.",
      dateOfBirth: iso(21 * 365 + 88, now),
      aircraft: [skyhawk, c152],
      flights: generate(2, 37, 300, 2, [skyhawk, c152], now, {
        dual: 0.72, instrument: 0.08, night: 0.12, solo: 0.28,
      }),
      certificates: [],
      medicals: [{ medical_class: "Third class", exam_date: iso(260, now), expires_date: endOfMonths(iso(260, now), 60), examiner: "AME" }],
      endorsements: [
        { endorsement_type: "Solo flight — 61.87(n)", date: iso(120, now), instructor_name: "D. Vasquez", instructor_cert: "4028117CFI" },
        { endorsement_type: "Solo cross-country — 61.93(c)(1)", date: iso(74, now), instructor_name: "D. Vasquez", instructor_cert: "4028117CFI" },
      ],
    },
    {
      name: "Lapsed Certificate",
      summary: "Review overdue, medical expired, not passenger-current. All the red paths.",
      dateOfBirth: iso(52 * 365 + 88, now),
      aircraft: [archer],
      flights: generate(3, 41, 900, 800, [archer], now, {
        dual: 0.1, instrument: 0.05, night: 0.1, solo: 0,
      }),
      certificates: [
        { kind: "certificate", name: "Private Pilot — Airplane Single-Engine Land", number: "2740193", issued_date: iso(3400, now) },
      ],
      medicals: [{ medical_class: "Third class", exam_date: iso(1900, now), expires_date: endOfMonths(iso(1900, now), 24), examiner: "AME" }],
      endorsements: [
        { endorsement_type: "Flight review — 61.56(a)", date: iso(1150, now), instructor_name: "R. Halloway", instructor_cert: "2901884CFI" },
      ],
    },
    {
      name: "High Time",
      summary: "930 flights over twelve years. For the stats charts and long lists.",
      dateOfBirth: iso(47 * 365 + 88, now),
      aircraft: [
        bonanza,
        craft("N118CM", "BE58", "Beechcraft Baron 58", { cc: "AMEL", complex: true, hp: true }),
        skyhawk,
        craft("N90210", "SR22", "Cirrus SR22 G6", { hp: true, taa: true }),
        c152,
        craft("N83PT", "PA18", "Piper PA-18 Super Cub", { tw: true }),
      ],
      flights: [],
      certificates: [
        { kind: "certificate", name: "Private Pilot — Airplane Single-Engine Land", number: "1847302", issued_date: iso(4380, now) },
        { kind: "rating", name: "Instrument — Airplane", number: "", issued_date: iso(3900, now) },
        { kind: "certificate", name: "Commercial Pilot — Airplane Single-Engine Land", number: "1847302", issued_date: iso(3100, now) },
        { kind: "rating", name: "Multi-Engine Land", number: "", issued_date: iso(2600, now) },
      ],
      medicals: [{ medical_class: "Second class", exam_date: iso(120, now), expires_date: endOfMonths(iso(120, now), 12), examiner: "AME" }],
      endorsements: [
        { endorsement_type: "Flight review — 61.56(a)", date: iso(300, now), instructor_name: "P. Lindqvist", instructor_cert: "3771205CFII" },
        { endorsement_type: "High performance — 61.31(f)", date: iso(3050, now), instructor_name: "P. Lindqvist", instructor_cert: "3771205CFII" },
        { endorsement_type: "Tailwheel — 61.31(i)", date: iso(1400, now), instructor_name: "J. Ferreira", instructor_cert: "3552019CFI" },
      ],
    },
    {
      name: "Fresh Start",
      summary: "Completely empty. For the first-run and empty-list states.",
      dateOfBirth: "",
      aircraft: [], flights: [], certificates: [], medicals: [], endorsements: [],
    },
  ].map((a) =>
    a.name === "High Time"
      ? {
          ...a,
          flights: generate(4, 930, 4400, 3, a.aircraft, now, {
            dual: 0.04, instrument: 0.34, night: 0.19, solo: 0,
          }),
        }
      : a
  );
}

/**
 * Weight and balance, following the FIT Aviation cards.
 *
 * The arithmetic is the same three-step chain the card walks: ramp weight, less
 * taxi fuel gives takeoff, less trip fuel gives landing — each with its own
 * centre of gravity, because burning fuel at the tank's arm moves the CG as
 * well as the weight.
 *
 * Everything aircraft-specific lives in a `Profile`, so a second aeroplane is a
 * row of numbers rather than a second copy of this file.
 *
 * Ported from the iOS app's `Logic/WeightBalance.swift`, field for field, so
 * the two can be diffed when a card changes.
 */

export const POUNDS_PER_GALLON = 6;

/**
 * Which quantity an envelope is drawn against.
 *
 * Most light singles publish centre of gravity; the Citabria publishes moment.
 * They are not interchangeable — a straight line on a moment chart is a curve
 * in CG, so converting one to the other by dividing through would misplace the
 * limit everywhere except the points it was sampled at.
 */
export type EnvelopeAxis = "cg" | "moment";

export interface Limit {
  weight: number;
  /** A CG in inches, or a moment in inch-pounds — per the profile's axis. */
  value: number;
}

/**
 * An optional addition or subtraction the card lists, like removing a seat
 * cushion or wearing a parachute.
 */
export interface Extra {
  id: string;
  label: string;
  /** Negative for something removed. */
  weight: number;
  arm: number;
}

export interface Profile {
  /** Stable across renames — the picker and the stored selection key on it. */
  id: string;
  name: string;

  /** What the stations are called on this card. A Citabria has a front and a
   *  rear seat, not "seats 1 + 2". */
  frontLabel: string;
  rearLabel: string;
  baggageLabel: string;

  /** Inches aft of datum. */
  seats12Arm: number;
  seats34Arm: number;
  baggageArm: number;
  fuelArm: number;

  fuelCapacityGal: number;
  maxGrossLb: number;
  /** Zero means the card doesn't print one, so nothing is asserted. */
  maxBaggageLb: number;

  /** False on cards that stop at a total — the Citabria's does. */
  hasFuelBurnChain: boolean;
  extras: Extra[];
  /** Printed on the card and worth repeating. */
  note: string;

  envelopeAxis: EnvelopeAxis;
  /** Forward (left) limit as breakpoints, lowest weight first. */
  forwardLimit: Limit[];
  /** Aft (right) limit, same units. A single entry means a flat limit. */
  aftLimit: Limit[];

  /**
   * False while the limits are traced from a chart rather than read from the
   * POH. The screen refuses to give an in-limits verdict until this is true —
   * half an inch of CG is the difference between inside the envelope and
   * outside it, and a printed chart can't be read closer than that.
   */
  limitsVerified: boolean;
  /** Built-in profiles can't be edited or deleted. */
  isBuiltIn: boolean;
}

export function hasEnvelope(p: Profile): boolean {
  return p.forwardLimit.length >= 2 && p.aftLimit.length > 0;
}

export function chartMinWeight(p: Profile): number {
  return p.forwardLimit[0]?.weight ?? 0;
}

export function chartMaxWeight(p: Profile): number {
  return Math.max(p.maxGrossLb, p.forwardLimit[p.forwardLimit.length - 1]?.weight ?? 0);
}

/**
 * A limit line read at a weight: linear between breakpoints, held flat beyond
 * either end.
 */
export function interpolate(points: Limit[], weight: number): number | null {
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length === 1) return first.value;
  if (weight <= first.weight) return first.value;
  if (weight >= last.weight) return last.value;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (weight <= b.weight) {
      if (b.weight <= a.weight) return a.value;
      const t = (weight - a.weight) / (b.weight - a.weight);
      return a.value + t * (b.value - a.value);
    }
  }
  return last.value;
}

export const forwardValue = (p: Profile, w: number) => interpolate(p.forwardLimit, w);
export const aftValue = (p: Profile, w: number) => interpolate(p.aftLimit, w);

/**
 * Enough of a profile to compute with. An envelope is optional: a card whose
 * chart hasn't been transcribed still adds up correctly, and refusing to save
 * it would be worse than plotting on paper.
 */
export function isUsable(p: Profile): boolean {
  return p.name.trim().length > 0 && p.maxGrossLb > 0 && p.fuelCapacityGal > 0;
}

// ---------- Input and output ----------

export interface WBInput {
  emptyWeight: number;
  /** Some weighing reports give a moment instead; the screen divides it out. */
  emptyArm: number;
  seats12: number;
  seats34: number;
  baggage: number;
  fuelGal: number;
  taxiGal: number;
  tripGal: number;
  /** Ids of the profile's optional items that are switched on. */
  extras: string[];
}

export function emptyInput(): WBInput {
  return {
    emptyWeight: 0, emptyArm: 0, seats12: 0, seats34: 0, baggage: 0,
    fuelGal: 0, taxiGal: 0, tripGal: 0, extras: [],
  };
}

export interface Row {
  label: string;
  weight: number;
  arm: number;
  moment: number;
}

export interface Point {
  weight: number;
  moment: number;
  /** null at zero weight, where a centre of gravity has no meaning. */
  cg: number | null;
  overGross: boolean;
  /**
   * null when it can't be worked out, when the profile has no envelope, or
   * when the limits haven't been confirmed — no verdict from traced numbers.
   */
  withinEnvelope: boolean | null;
}

export interface WBResult {
  rows: Row[];
  ramp: Point;
  takeoff: Point;
  landing: Point;
  /** Loading problems that don't depend on the envelope. */
  warnings: string[];
}

function point(weight: number, moment: number, profile: Profile): Point {
  const cg = weight > 0 ? moment / weight : null;
  const overGross = weight > profile.maxGrossLb + 0.0001;
  const value = profile.envelopeAxis === "cg" ? cg : weight > 0 ? moment : null;

  let withinEnvelope: boolean | null = null;
  if (profile.limitsVerified && hasEnvelope(profile) && value !== null) {
    if (overGross) {
      withinEnvelope = false;
    } else {
      const fwd = forwardValue(profile, weight);
      const aft = aftValue(profile, weight);
      withinEnvelope =
        fwd === null || aft === null
          ? null
          : value >= fwd - 0.0001 && value <= aft + 0.0001;
    }
  }
  return { weight, moment, cg, overGross, withinEnvelope };
}

/** The quantity this profile's envelope is drawn against. */
export function envelopeValue(p: Point, profile: Profile): number | null {
  return profile.envelopeAxis === "cg" ? p.cg : p.weight > 0 ? p.moment : null;
}

const fmt = (n: number, places = 1) =>
  n.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places });

export function computeWeightBalance(input: WBInput, profile: Profile): WBResult {
  const fuelWeight = input.fuelGal * POUNDS_PER_GALLON;
  const taxiWeight = input.taxiGal * POUNDS_PER_GALLON;
  const tripWeight = input.tripGal * POUNDS_PER_GALLON;

  const rows: Row[] = [
    { label: "Basic Empty Weight", weight: input.emptyWeight, arm: input.emptyArm, moment: 0 },
    { label: profile.frontLabel, weight: input.seats12, arm: profile.seats12Arm, moment: 0 },
    { label: profile.rearLabel, weight: input.seats34, arm: profile.seats34Arm, moment: 0 },
    { label: profile.baggageLabel, weight: input.baggage, arm: profile.baggageArm, moment: 0 },
    { label: "Fuel", weight: fuelWeight, arm: profile.fuelArm, moment: 0 },
  ];
  // Cushions out, parachutes on — each a fixed weight at a fixed arm.
  for (const extra of profile.extras) {
    if (input.extras.includes(extra.id)) {
      rows.push({ label: extra.label, weight: extra.weight, arm: extra.arm, moment: 0 });
    }
  }
  for (const row of rows) row.moment = row.weight * row.arm;

  const rampWeight = rows.reduce((t, r) => t + r.weight, 0);
  const rampMoment = rows.reduce((t, r) => t + r.moment, 0);
  const ramp = point(rampWeight, rampMoment, profile);

  // Burnt fuel leaves at the tank's arm, which shifts the CG as well as
  // lightening the aeroplane.
  const takeoff = point(
    rampWeight - taxiWeight,
    rampMoment - taxiWeight * profile.fuelArm,
    profile
  );
  const landing = point(
    takeoff.weight - tripWeight,
    takeoff.moment - tripWeight * profile.fuelArm,
    profile
  );

  const warnings: string[] = [];
  if (input.fuelGal > profile.fuelCapacityGal + 0.0001) {
    warnings.push(
      `Fuel is ${fmt(input.fuelGal)} gal; the tanks hold ${fmt(profile.fuelCapacityGal)} gal.`
    );
  }
  if (input.taxiGal + input.tripGal > input.fuelGal + 0.0001) {
    warnings.push("Taxi and trip burn together are more fuel than you started with.");
  }
  if (profile.maxBaggageLb > 0 && input.baggage > profile.maxBaggageLb + 0.0001) {
    warnings.push(
      `Baggage is ${fmt(input.baggage)} lb; the limit is ${fmt(profile.maxBaggageLb)} lb.`
    );
  }
  if (ramp.overGross) {
    warnings.push(
      `Ramp weight is ${fmt(ramp.weight)} lb, over the ${fmt(profile.maxGrossLb)} lb maximum.`
    );
  } else if (takeoff.overGross) {
    warnings.push(
      `Takeoff weight is ${fmt(takeoff.weight)} lb, over the ${fmt(profile.maxGrossLb)} lb maximum.`
    );
  }
  if (input.emptyWeight > 0 && input.emptyArm <= 0) {
    warnings.push("Enter the empty arm, or the CG can't be worked out.");
  }

  return { rows, ramp, takeoff, landing, warnings };
}

// ---------- The FIT Aviation fleet ----------
//
// Station arms, capacities and gross weights are printed figures and are
// exact. The envelopes are traced from the charts on those cards, which is why
// every one of these has limitsVerified false — the screen gives no in-limits
// verdict until somebody checks them against the POH.

const lim = (pairs: [number, number][]): Limit[] =>
  pairs.map(([weight, value]) => ({ weight, value }));

const piperBase = {
  frontLabel: "Seats 1 + 2",
  rearLabel: "Seats 3 + 4",
  baggageLabel: "Baggage",
  seats12Arm: 80.5,
  seats34Arm: 118.1,
  baggageArm: 142.8,
  fuelArm: 95.0,
  hasFuelBurnChain: true,
  extras: [] as Extra[],
  note: "",
  envelopeAxis: "cg" as EnvelopeAxis,
  limitsVerified: false,
  isBuiltIn: true,
};

export const ARCHER_G1000: Profile = {
  ...piperBase,
  id: "builtin.pa28-181-archer-g1000",
  name: "PA-28-181 Archer G1000",
  fuelCapacityGal: 48,
  maxGrossLb: 2550,
  maxBaggageLb: 200,
  forwardLimit: lim([[1200, 82.0], [2050, 82.0], [2550, 88.0]]),
  aftLimit: lim([[1200, 93.0], [2550, 93.0]]),
};

export const WARRIOR: Profile = {
  ...piperBase,
  id: "builtin.pa28-161-warrior",
  name: "PA-28-161 Warrior",
  fuelCapacityGal: 48,
  maxGrossLb: 2440,
  // The card doesn't print a baggage limit, so nothing is asserted.
  maxBaggageLb: 0,
  forwardLimit: lim([
    [1200, 83.0], [2050, 83.0], [2100, 84.0], [2200, 85.0],
    [2300, 86.0], [2380, 87.0], [2440, 88.0],
  ]),
  aftLimit: lim([[1200, 93.0], [2440, 93.0]]),
};

export const SEMINOLE: Profile = {
  ...piperBase,
  id: "builtin.pa44-180-seminole",
  name: "PA-44-180 Seminole",
  fuelCapacityGal: 108,
  maxGrossLb: 3800,
  maxBaggageLb: 0,
  // The forward limit is a curve on this card, so it takes more breakpoints
  // than the singles: flat at 84 to 2800, then an inch per hundred pounds from
  // 3400 up.
  forwardLimit: lim([
    [2300, 84.0], [2800, 84.0], [3400, 85.0], [3500, 86.0],
    [3600, 87.0], [3700, 88.0], [3800, 89.0],
  ]),
  aftLimit: lim([[2300, 93.0], [3800, 93.0]]),
};

/**
 * The Citabria's card is a different shape from the Pipers': it ends at a total
 * rather than walking taxi and trip fuel out, its seats are front and rear, and
 * its envelope is plotted against **moment** rather than centre of gravity.
 *
 * The envelope is deliberately left empty. The chart on the card is small,
 * moment-scaled, and carries two overlapping regions — normal-and-acrobatic
 * against normal-only — and reading it to better than about 500 in-lb isn't
 * possible, which at 1,500 lb is a third of an inch of CG. The weights, arms,
 * moments and totals are all exact; the plot is left to paper until the POH
 * figures are to hand.
 */
export const CITABRIA: Profile = {
  id: "builtin.7eca-citabria",
  name: "7ECA Champion Citabria",
  frontLabel: "Front Seat Occupant",
  rearLabel: "Rear Seat Occupant",
  baggageLabel: "Baggage Area",
  seats12Arm: 11.5,
  seats34Arm: 42.0,
  baggageArm: 69.0,
  fuelArm: 24.5,
  fuelCapacityGal: 35,
  maxGrossLb: 1800,
  maxBaggageLb: 100,
  hasFuelBurnChain: false,
  extras: [
    { id: "citabria.front.cushion", label: "Front cushion removed", weight: -2, arm: 11.5 },
    { id: "citabria.front.parachute", label: "Front parachute", weight: 15, arm: 11.5 },
    { id: "citabria.rear.cushion", label: "Rear cushion removed", weight: -2, arm: 42.0 },
    { id: "citabria.rear.parachute", label: "Rear parachute", weight: 15, arm: 42.0 },
  ],
  note: "No baggage is allowed in the aerobatic category.",
  envelopeAxis: "moment",
  forwardLimit: [],
  aftLimit: [],
  limitsVerified: false,
  isBuiltIn: true,
};

export const BUILT_IN_PROFILES: Profile[] = [ARCHER_G1000, WARRIOR, SEMINOLE, CITABRIA];

/** A blank profile for the "add your own" form. */
export function blankProfile(id: string): Profile {
  return {
    id,
    name: "",
    frontLabel: "Seats 1 + 2",
    rearLabel: "Seats 3 + 4",
    baggageLabel: "Baggage",
    seats12Arm: 0, seats34Arm: 0, baggageArm: 0, fuelArm: 0,
    fuelCapacityGal: 0, maxGrossLb: 0, maxBaggageLb: 0,
    hasFuelBurnChain: true,
    extras: [],
    note: "",
    envelopeAxis: "cg",
    forwardLimit: [],
    aftLimit: [],
    limitsVerified: false,
    isBuiltIn: false,
  };
}

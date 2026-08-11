// Tests for the weight-and-balance card and the FIT fleet's profiles.
// Run with: node scripts/test-weightbalance.mts
import {
  computeWeightBalance, emptyInput, forwardValue, hasEnvelope, isUsable, interpolate,
  ARCHER_G1000, WARRIOR, SEMINOLE, CITABRIA, BUILT_IN_PROFILES, blankProfile,
} from "../lib/weightbalance.ts";
import type { Profile, WBInput } from "../lib/weightbalance.ts";

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

// ---- the printed arms ----
near("seats 1+2 arm", ARCHER_G1000.seats12Arm, 80.5);
near("seats 3+4 arm", ARCHER_G1000.seats34Arm, 118.1);
near("baggage arm", ARCHER_G1000.baggageArm, 142.8);
near("fuel arm", ARCHER_G1000.fuelArm, 95.0);
near("Archer gross", ARCHER_G1000.maxGrossLb, 2550);
near("Archer fuel", ARCHER_G1000.fuelCapacityGal, 48);

// ---- the chain ----
const wb: WBInput = {
  ...emptyInput(),
  emptyWeight: 1690, emptyArm: 86.5, seats12: 340, baggage: 25,
  fuelGal: 40, taxiGal: 1, tripGal: 15,
};
const card = computeWeightBalance(wb, ARCHER_G1000);
near("ramp weight adds the stations up", card.ramp.weight, 1690 + 340 + 25 + 240);
near("...and the moments with them", card.ramp.moment,
  1690 * 86.5 + 340 * 80.5 + 25 * 142.8 + 240 * 95.0);
near("ramp CG is moment over weight", card.ramp.cg!, card.ramp.moment / card.ramp.weight);
near("takeoff is ramp less taxi burn", card.takeoff.weight, card.ramp.weight - 6);
near("...losing it at the fuel arm", card.takeoff.moment, card.ramp.moment - 6 * 95.0);
near("landing is takeoff less trip burn", card.landing.weight, card.takeoff.weight - 90);
// Fuel sits aft of the loaded CG here, so burning it pulls the CG forward.
must("burning fuel aft of the CG moves it forward", card.landing.cg! < card.ramp.cg!,
  `${card.ramp.cg} → ${card.landing.cg}`);
check("five load rows", card.rows.length, 5);
check("an empty card has no CG", computeWeightBalance(emptyInput(), ARCHER_G1000).ramp.cg, null);

// ---- warnings that don't need an envelope ----
must("too much fuel is flagged",
  computeWeightBalance({ ...wb, fuelGal: 60 }, ARCHER_G1000).warnings.some((w) => w.includes("tanks hold")));
must("burning more than you loaded is flagged",
  computeWeightBalance({ ...wb, tripGal: 50 }, ARCHER_G1000).warnings.some((w) => w.includes("more fuel than you started")));
const heavy = computeWeightBalance({ ...wb, baggage: 400 }, ARCHER_G1000);
must("over gross is flagged", heavy.ramp.overGross);
must("...and said out loud", heavy.warnings.some((w) => w.includes("over the")));
must("an empty weight with no arm is flagged",
  computeWeightBalance({ ...emptyInput(), emptyWeight: 1690 }, ARCHER_G1000)
    .warnings.some((w) => w.includes("empty arm")));

// ---- the forward limit interpolates ----
near("below the knee", forwardValue(ARCHER_G1000, 1500)!, 82.0);
near("at the knee", forwardValue(ARCHER_G1000, 2050)!, 82.0);
near("at gross", forwardValue(ARCHER_G1000, 2550)!, 88.0);
near("halfway up the slope", forwardValue(ARCHER_G1000, 2300)!, 85.0);
near("held flat below the chart", forwardValue(ARCHER_G1000, 900)!, 82.0);
near("held flat above it", forwardValue(ARCHER_G1000, 3000)!, 88.0);
check("an empty limit reads as nothing", interpolate([], 2000), null);

// ---- the verdict is withheld until the limits are checked ----
must("an unverified envelope refuses to judge", card.takeoff.withinEnvelope === null);

const verified: Profile = {
  ...ARCHER_G1000, id: "test.verified", limitsVerified: true, isBuiltIn: false,
};
const judged = computeWeightBalance(wb, verified);
must("a verified one does judge", judged.takeoff.withinEnvelope !== null);
const forward = computeWeightBalance(
  { ...emptyInput(), emptyWeight: 2000, emptyArm: 70 }, verified);
must("ahead of the forward limit is outside", forward.ramp.withinEnvelope === false);
const aft = computeWeightBalance(
  { ...emptyInput(), emptyWeight: 2000, emptyArm: 99 }, verified);
must("behind the aft limit is outside", aft.ramp.withinEnvelope === false);
const over = computeWeightBalance(
  { ...emptyInput(), emptyWeight: 2700, emptyArm: 88 }, verified);
must("over gross is outside whatever the CG", over.ramp.withinEnvelope === false);

// ---- the fleet ----
check("four aircraft are built in", BUILT_IN_PROFILES.length, 4);
check("...with unique ids", new Set(BUILT_IN_PROFILES.map((p) => p.id)).size, 4);
must("...all marked built-in", BUILT_IN_PROFILES.every((p) => p.isBuiltIn));
// Every one is traced from a card, so none may give a verdict yet.
must("...and none claim verified limits", BUILT_IN_PROFILES.every((p) => !p.limitsVerified));

near("Warrior gross", WARRIOR.maxGrossLb, 2440);
near("Warrior forward limit low", forwardValue(WARRIOR, 1500)!, 83.0);
near("...and at gross", forwardValue(WARRIOR, 2440)!, 88.0);
near("Seminole gross", SEMINOLE.maxGrossLb, 3800);
near("Seminole fuel", SEMINOLE.fuelCapacityGal, 108);
near("Seminole flat to 2800", forwardValue(SEMINOLE, 2600)!, 84.0);
near("...an inch per hundred up top", forwardValue(SEMINOLE, 3600)!, 87.0);
near("...reaching 89 at gross", forwardValue(SEMINOLE, 3800)!, 89.0);

// ---- the Citabria is the odd one out ----
must("no fuel-burn chain", !CITABRIA.hasFuelBurnChain);
check("plotted against moment", CITABRIA.envelopeAxis, "moment");
must("envelope not transcribed", !hasEnvelope(CITABRIA));
must("...but still usable", isUsable(CITABRIA));
check("names its own seats", CITABRIA.frontLabel, "Front Seat Occupant");
check("four adjustments", CITABRIA.extras.length, 4);
must("one of which subtracts", CITABRIA.extras.some((e) => e.weight < 0));
must("repeats the aerobatic baggage rule", CITABRIA.note.includes("aerobatic"));

const aero: WBInput = { ...emptyInput(), emptyWeight: 1189.3, emptyArm: 12.42, seats12: 170 };
const plain = computeWeightBalance(aero, CITABRIA);
const chuted = computeWeightBalance({ ...aero, extras: ["citabria.front.parachute"] }, CITABRIA);
near("a parachute adds its weight", chuted.ramp.weight, plain.ramp.weight + 15);
near("...at its own arm", chuted.ramp.moment, plain.ramp.moment + 15 * 11.5);
near("removing a cushion takes weight off",
  computeWeightBalance({ ...aero, extras: ["citabria.front.cushion"] }, CITABRIA).ramp.weight,
  plain.ramp.weight - 2);
near("an unknown adjustment id is ignored",
  computeWeightBalance({ ...aero, extras: ["nonsense"] }, CITABRIA).ramp.weight, plain.ramp.weight);
// The moment printed on N131RA's card is its empty weight times its arm.
near("the card's printed empty moment checks out", 1189.3 * 12.42, 14771, 1.0);

// ---- the editor's save gate ----
must("a blank profile isn't usable", !isUsable(blankProfile("x")));
must("...but a named one with limits is",
  isUsable({ ...blankProfile("x"), name: "Test", maxGrossLb: 2000, fuelCapacityGal: 40 }));

console.log(failures === 0 ? "\nAll weight and balance tests passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);

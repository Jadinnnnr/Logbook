// Tests for the pilot name rules: shape, and the profanity/slur screen.
// Run with: node scripts/test-username.mts
import { nameError } from "../lib/username.ts";

let failures = 0;
function expectOk(name: string) {
  const e = nameError(name);
  if (e) {
    failures++;
    console.error(`FAIL should allow ${JSON.stringify(name)} — got: ${e}`);
  } else {
    console.log(`ok   allows ${JSON.stringify(name)}`);
  }
}
function expectRejected(name: string, why: string) {
  if (nameError(name) === null) {
    failures++;
    console.error(`FAIL should reject ${JSON.stringify(name)} (${why})`);
  } else {
    console.log(`ok   rejects ${JSON.stringify(name)} (${why})`);
  }
}

// Ordinary names, including ones that embed a banned string innocently.
for (const n of [
  "JR", "Test Pilot", "amelia.flies", "Ana-Maria", "O'Brien", "skyhawk_99",
  "Dick Van Dyke", "Raccoon Pilot", "Spicy Landings", "Pakistani Pilot",
  "Assessment", "Classy", "Scunthorpe Flyer", "Nazir Khan", "Shiitake",
]) expectOk(n);

// Shape rules.
expectRejected("a", "too short");
expectRejected("x".repeat(31), "too long");
expectRejected("_leading", "starts with punctuation");
expectRejected("trailing-", "ends with punctuation");
expectRejected("two  spaces", "double space");
expectRejected("1234", "no letters");
expectRejected("has<script>", "disallowed characters");

// Profanity and slurs, including disguised spellings.
for (const [n, why] of [
  ["fuck", "plain profanity"],
  ["FuCkEr", "mixed case"],
  ["f.u.c.k", "separated by punctuation"],
  ["fuuuck", "repeated letters"],
  ["sh1t", "leetspeak"],
  ["a55hole", "leetspeak"],
  ["n1gger", "slur, leetspeak"],
  ["faggot", "slur"],
  ["Big Ass", "profanity as a standalone word"],
  ["Sh1tHawk", "profanity inside a compound"],
] as [string, string][]) expectRejected(n, why);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nAll name rule tests passed");
if (failures) process.exit(1);

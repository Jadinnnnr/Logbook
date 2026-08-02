import fs from "fs";
import { buildChart } from "./extract.mjs";
import { CHARTS, axis } from "./charts.mjs";

const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;

// ISA deviation limits printed on each chart's envelope.
const ENVELOPE = { 158: [-15, 35], 160: [-15, 35], 176: [-15, 35], 177: [-15, 30] };
const FIGURE = { 158: "5-7", 160: "5-11", 176: "5-41", 177: "5-43" };

function sampleChart(pageNo) {
  const ch = buildChart(pageNo);
  const C = ch.C;
  const dist = axis(C.dist), oatA = axis(C.oat), wtA = axis(C.wt), windA = axis(C.wind);

  // --- Panel 1: distance at max weight, zero wind, per PA curve ---
  const oats = [];
  for (let t = -20; t <= 50; t += 2) oats.push(t);
  // ch.pa is ordered left→right = highest PA first; paLevels is ascending.
  const byLevel = [...ch.pa].reverse();
  const paCurves = C.paLevels.map((lvl, i) => {
    const c = byLevel[i];
    const isa = 15 - 1.98 * (lvl / 1000);
    const [lo, hi] = ENVELOPE[pageNo];
    return {
      pa: lvl,
      minOat: round(isa + lo),
      maxOat: round(isa + hi),
      // Sampled across the whole axis; the app only reads inside [minOat,maxOat].
      d: oats.map(t => round(dist.toVal(c.fit(oatA.toPx(t))), 0)),
    };
  });

  // --- Panel 2: weight guides ---
  // The printed axis minimum, not wherever the crop happened to start.
  const weights = [];
  for (let w = C.wt.min; w <= C.wt.refV; w += 50) weights.push(w);
  if (weights.at(-1) !== C.wt.refV) weights.push(C.wt.refV);
  // Guides come out ordered by pixel position; put them in ascending distance
  // so the bracket search downstream reads naturally.
  const weightGuides = ch.wt
    .map(c => weights.map(w => round(dist.toVal(c.fit(wtA.toPx(w))), 0)))
    .sort((a, b) => a.at(-1) - b.at(-1));

  // --- Panel 3: headwind guides ---
  const winds = [];
  for (let k = 0; k <= 15; k++) winds.push(k);
  const windGuides = ch.hw
    .map(c => winds.map(k => round(dist.toVal(c.fit(windA.toPx(k))), 0)))
    .sort((a, b) => a[0] - b[0]);

  return {
    id: C.name, title: C.title, flaps: C.flaps, page: pageNo, figure: FIGURE[pageNo],
    oats, paCurves, weights, weightGuides, winds, windGuides,
    refWeight: C.wt.refV,
    example: C.example,
  };
}

const out = {};
for (const p of [158, 160, 176, 177]) {
  const s = sampleChart(p);
  out[s.id] = s;
  console.log(s.id, "paCurves", s.paCurves.length, "weightGuides", s.weightGuides.length, "windGuides", s.windGuides.length);
}
fs.writeFileSync("pa28-181.json", JSON.stringify(out));
console.log("bytes", fs.statSync("pa28-181.json").size);

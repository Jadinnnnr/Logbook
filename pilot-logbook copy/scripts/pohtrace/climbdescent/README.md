# Climb and descent nomogram tracer

How `lib/pa28-181-climbdescent.ts` was produced, from figures 5-17 (time, fuel
and distance to climb) and 5-37 (to descend) of the PA-28-181 POH, Piper report
VB-2960. Kept so the digitisation can be re-run and checked; nothing at runtime
imports it.

Separate from the tracer one directory up because these two figures are a
different kind of chart. The takeoff and landing figures are grids you
interpolate; these are nomograms you walk:

> Enter at the outside air temperature, go up to the pressure altitude curve,
> then straight across to each of the three panel curves, and drop down to read
> time, fuel and distance.

That horizontal leg is the whole trick. It is a line of constant height on the
page, so a single coordinate carries the reading from the carpet into all three
panels, and that is the form the exported data takes. Do it twice — once at
cruise altitude, once at the airport — and subtract, which is what each figure's
own printed example does.

## Steps

1. **Render and rotate** (`geom.mjs`). Both figures are printed sideways; a 90°
   clockwise turn puts them the way a pilot reads them.
2. **De-skew** (`deskew.mjs`). Both pages are scans, tilted about a third of a
   degree. Left in, that is nine pixels across the plot — 1.6 n.m. on the
   distance panel. The skew is measured on the plot box's own four borders,
   because the interior rules sit closer together than the scan drifts and any
   window wide enough to follow one is wide enough to jump to its neighbour.
3. **Strip the grid and the labels** (`clean.mjs`). A morphological opening
   deletes the thin rules and keeps the thicker curves; a connected-component
   filter then drops the altitude labels, which are printed clear of their
   curves. Figure 5-37 additionally needs its heavy major rules removed, but only
   the rule's own ink — its curves are 6–9 px against 2–3 px rules, and too much
   slack there erases the 6,000 ft curve outright.
4. **Follow the altitude carpet** (`follow.mjs`). Each curve is walked out from a
   seed in both directions; runs already claimed are off limits, which stops the
   walk swapping curves where one crosses an ISA line.
5. **Follow the three panel curves** (`trace.mjs`), reading each one off the
   right-hand edge of its ink rather than the middle. Both figures draw their
   worked example over the top of the curves, and the arrowhead where a
   construction line lands is a solid blob several times the width of the line.
   The arrows always come in from the left, so the right edge is clean while the
   centre is dragged — on 5-37 by 1.3 n.m., right at the reading the example is
   checked against.
6. **Sample and write** (`export.mjs`).

## Validation

The strong check is that each figure *draws its own worked example on itself*:
dashed lines across the panels at the two entry heights, and a dashed line
dropping from each intersection to the axis. Those are the answer Piper read,
before rounding, and the traced curves are held to them:

| figure 5-17 | model | Piper's drop line | Piper printed |
| --- | --- | --- | --- |
| cruise time | 12.38 | 11.92 | 12 |
| cruise fuel | 4.28 | 4.29 | 4 |
| cruise distance | 16.59 | 17.13 | 17 |

| figure 5-37 | model | Piper's drop line | Piper printed |
| --- | --- | --- | --- |
| cruise time | 15.61 | 15.40 | 16 |
| cruise fuel | 3.04 | 3.15 | 3.2 |
| cruise distance | 31.91 | 32.53 | 33 |

Every reading lands within about half a unit of the line Piper drew, and the
entry point on 5-17 within half a pixel of the construction line printed on the
page. Where the model and the printed answer differ by more than that, it is
Piper's rounding: their own cruise-time drop line on 5-37 reads 15.4 and they
printed 16.

The runtime checks are in `scripts/test-climbdescent.mts`, which holds both
examples and also checks that every reading grows monotonically with altitude —
the failure this is most exposed to is an altitude curve traced out of order,
and once the labels are stripped nothing else would catch it.

## Re-running

```bash
node scripts/pohtrace/climbdescent/export.mjs
```

Expects the POH at the path in `../lib.mjs`. The calibration in `trace.mjs` is
in pixels of that exact scan; a different PDF needs it re-derived from the plot's
minor rules and re-checked against the printed axis labels. Requires `mupdf` from
npm (a WASM build, no native toolchain).

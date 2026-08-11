# PA-28-181 chart tracer

How `lib/pa28-181-charts.ts` was produced. Kept so the digitisation can be
re-run, checked, or extended to another aircraft — it is not part of the app and
nothing at runtime imports it.

The performance graphs in the PA-28-181 POH (Piper report VB-2960, 16 Nov 2020)
are scanned raster images inside the PDF, not vector art, so the curves had to be
recovered from pixels:

1. **Render** the page at 6× with MuPDF (`lib.mjs`).
2. **Strip the grid** — erase any pixel belonging to a straight run longer than
   ~34 px. The gridlines are exactly straight; the curves are diagonal, so they
   survive as short fragments.
3. **Split the families by orientation** (`trace.mjs`, `detect.mjs`). In each
   panel two families cross: on the temperature panel the pressure-altitude
   curves run one way and the ISA envelope lines the other. A PCA on each
   fragment gives its direction, and the elongation ratio separates line pieces
   from the text labels sitting on top of them.
4. **Seed and follow** (`follow.mjs`). Row-following from a clean seed row finds
   how many curves there are and roughly where. The weight and wind guides are
   seeded just above their reference line, where they are all present and evenly
   spread.
5. **Refit** (`extract.mjs`). Following alone drops a curve wherever the grid
   strip left a gap, so every fragment is then assigned to its nearest curve and
   the curve refitted as a quadratic. This recovers the full extent.
6. **Sample** into chart units and write the JSON (`export.mjs`).

## Validation

Each figure carries its own worked example, printed on the chart. Walking the
traced curves with the example's inputs reproduces the example's answer to
within 2.1% on all four charts — that is the primary check, and it lives in
`scripts/test-pohcharts.mts`. Two more checks were used while building:

- **The ISA envelope.** Each pressure-altitude curve should begin and end where
  the printed ISA−15 and ISA+35 lines cut it. The traced ends land within a
  degree or two, which independently confirms the axis calibration.
- **Overlay.** Drawing the computed construction back onto the page puts it on
  top of the dashed example construction printed in the book.

## Re-running

```bash
node scripts/pohtrace/export.mjs
```

Expects the POH at the path in `charts.mjs`, and pixel calibrations that match
that exact PDF — a different scan needs the gridline positions in `charts.mjs`
re-derived. Requires `mupdf` from npm (a WASM build, no native toolchain).

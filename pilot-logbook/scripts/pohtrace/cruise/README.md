# Cruise table extractor

How `lib/pa28-181-cruise.ts` was produced, from figures 5-21, 5-23 and 5-25 of
the PA-28-181 POH (Piper VB-2960) — engine and cruise performance at 55%, 65%
and 75% power.

**Nothing here is traced.** Unlike the takeoff, climb and descent figures, these
three are tables rather than graphs, and the PDF carries a real text layer for
them: 850–900 characters a page against 129 on a graph page, which is only the
running head. So the numbers come out of the file exactly as Piper set them.
There is no scan to measure, no curve to follow, and no pixel calibration to get
wrong — which is why this is a separate, much shorter script from the tracers in
the sibling directories, and why its output is not an approximation of the book
but a transcription of it.

The work is only in putting the spans back into rows:

1. **Read positioned spans** from MuPDF's structured text.
2. **Derive the column centres from the page's own header row.** Not hard-coded:
   the odd and even pages sit about 32pt apart in the PDF's coordinate space, so
   one fixed set of centres bins the other page into the wrong columns — quietly,
   and only in the middle of the table. The header cells also carry footnote
   markers on two of the three pages (`Knots **`), so the match allows them.
3. **Group into rows** by vertical position, and start a new altitude block
   wherever the leftmost column carries a value.

## Validation

The printed table states two things redundantly, and both are checked on every
row. The extract refuses to write if either fails:

- **Fahrenheit against Celsius.** Every row prints both.
- **The stated ISA deviation against the standard lapse rate** at that altitude.

Two orderings are checked as well: ISA deviations must ascend down a block, and
the RPM needed to hold a given percentage of power must rise with temperature.

All three tables pass with no exceptions: 7 altitude blocks each, 29/29/32 rows,
14 true-airspeed values apiece. Piper prints TAS only at the coldest and warmest
row of each block — at constant power it barely moves with temperature, so they
gave the two ends and left the middle to the eye.

## What the runtime interpolates, and what it refuses to

`lib/cruise.ts` interpolates in **altitude**, because the tables step in
thousands and a VFR cruising altitude never lands on one — 5,500 and 7,500 are
where you actually fly. RPM and TAS are read between the two published altitudes
either side. It also interpolates **TAS along a block**, since Piper prints that
only at the two ends.

It does **not** interpolate temperature. The printed ISA deviations are the
columns of the table; there is nothing between them to read along, so they stay a
choice. Which ones are offered depends on the altitude — and between two
published altitudes, only the deviations *both* of them print, so every answer is
bracketed by four real rows rather than one row and a guess.

It refuses rather than extrapolates above a table's last altitude: there, the
engine cannot hold that power at all, and answering would be inventing an engine
setting.

`scripts/test-cruise.mts` walks all 90 published rows and checks that landing
exactly on one still returns that row's RPM to the revolution and its printed TAS
unchanged — interpolating altitude must not disturb the numbers the book actually
states. It then checks the in-between cases land proportionally, and that every
VFR cruising altitude reads at every power that reaches it.

## Two things the tables encode that are easy to miss

- **75% power stops at 7,000 ft**, where the other two reach 10,000 — and it is
  published at 3,000 and 5,000 ft, which the other two skip. So the altitude list
  genuinely depends on the power setting; it is not one ladder with a lower top.
  That is not a gap in the digitisation either: above 7,000 ft the engine cannot
  hold 75%, so the app offers no such altitude and says why.
- **The blocks narrow with altitude.** At 10,000 ft the 55% table runs only from
  ISA−15 to ISA, so a warm day up there is off the end of the book — which is why
  the temperature choices are read from the altitude, not offered as a fixed set.

## Re-running

```bash
node scripts/pohtrace/cruise/extract.mjs
```

Expects the POH at the path in the script (override with `POH_PDF`). Requires
`mupdf` from npm. Runtime checks live in `scripts/test-cruise.mts`.

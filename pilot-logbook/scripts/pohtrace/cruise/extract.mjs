import * as mupdf from "mupdf";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Figures 5-21, 5-23 and 5-25 of the PA-28-181 POH (Piper VB-2960) — engine and
 * cruise performance at 55%, 65% and 75% power.
 *
 * Unlike the takeoff, climb and descent figures, these three are *tables*, and
 * the PDF carries a real text layer for them: 850-900 characters a page against
 * 129 on a graph page, which is only the running head. So there is nothing to
 * trace and nothing to OCR — the numbers come out of the file exactly as Piper
 * set them, and the job is just to put them back into rows.
 *
 * Two arithmetic identities in the printed table catch any mistake in that:
 * Fahrenheit must agree with Celsius, and the stated ISA deviation must agree
 * with the standard lapse rate at that altitude. Both are checked below and the
 * extract refuses to write if either fails.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POH = process.env.POH_PDF ??
  "/Users/jadinnnnr/Library/Mobile Documents/com~apple~CloudDocs/Pilot Material/PiperPilot100iPOH.pdf";
const OUT = path.resolve(HERE, "../../../lib/pa28-181-cruise.ts");

const doc = mupdf.Document.openDocument(fs.readFileSync(POH), "application/pdf");

const PAGES = [
  { page: 165, figure: "5-21", power: 55, gph: 8.2 },
  { page: 166, figure: "5-23", power: 65, gph: 9.5 },
  { page: 167, figure: "5-25", power: 75, gph: 11.0 },
];

/** Every positioned span on a page. */
function spans(pageNo) {
  const st = JSON.parse(doc.loadPage(pageNo - 1).toStructuredText().asJSON());
  const out = [];
  for (const b of st.blocks ?? []) {
    for (const l of b.lines ?? []) {
      for (const s of l.spans ?? [{ text: l.text, bbox: l.bbox }]) {
        const t = (s.text ?? "").trim();
        if (t) out.push({ t, x: s.bbox.x, y: s.bbox.y });
      }
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Column centres, read off the page's own header row.
 *
 * Not hard-coded: the odd and even pages sit about 32pt apart in the PDF's
 * coordinate space, so a fixed set of centres bins one of them into the wrong
 * columns — quietly, and only in the middle of the table.
 */
function columns(all) {
  // Trailing footnote markers are part of the cell: 5-23 and 5-25 head the
  // last column "Knots **", and an exact match silently loses the column.
  const cell = (name) => all.filter((s) => new RegExp(`^${name}\\s*\\**$`).test(s.t));
  const feet = cell("Feet")[0];
  const cs = cell("°C").sort((a, b) => a.x - b.x);
  const f = cell("°F")[0];
  const rpm = cell("RPM")[0];
  const kt = cell("Knots")[0];
  if (!feet || cs.length !== 2 || !f || !rpm || !kt) {
    throw new Error(`header row not found (feet=${!!feet} °C=${cs.length} °F=${!!f} rpm=${!!rpm} knots=${!!kt})`);
  }
  return [
    ["alt", feet.x], ["isa", cs[0].x], ["c", cs[1].x],
    ["f", f.x], ["rpm", rpm.x], ["kt", kt.x],
  ];
}

const num = (s) => {
  if (s == null) return null;
  const v = Number(String(s).replace(/\s+/g, "").replace(/[−–—]/g, "-"));
  return Number.isFinite(v) ? v : null;
};

/** Standard atmosphere temperature, the same 1.98 °C per 1,000 ft the app uses. */
const isaTemp = (altFt) => 15 - 1.98 * (altFt / 1000);

const kt2 = (all) => all.find((s) => /^Knots\s*\**$/.test(s.t));

function table({ page, figure, power, gph }) {
  const all = spans(page);
  const cols = columns(all);
  const headerY = kt2(all).y;
  const note = all.find((s) => s.t.startsWith("NOTE"));
  const body = all.filter((s) => s.y > headerY + 8 && (!note || s.y < note.y - 4));

  // Rows: spans within a few points of each other vertically.
  const rows = [];
  for (const s of body) {
    const row = rows.find((r) => Math.abs(r.y - s.y) <= 5);
    if (row) row.items.push(s);
    else rows.push({ y: s.y, items: [s] });
  }

  const altitudes = [];
  let current = null;
  for (const row of rows) {
    const cell = {};
    for (const it of row.items) {
      let best = cols[0], bd = Infinity;
      for (const c of cols) {
        const d = Math.abs(it.x - c[1]);
        if (d < bd) { bd = d; best = c; }
      }
      if (cell[best[0]] !== undefined) throw new Error(`${figure}: two spans in column ${best[0]} at y=${row.y}`);
      cell[best[0]] = it.t;
    }

    if (cell.alt) {
      const alt = /sea level/i.test(cell.alt) ? 0 : num(cell.alt);
      if (alt === null) throw new Error(`${figure}: unreadable altitude "${cell.alt}"`);
      current = { alt, rows: [] };
      altitudes.push(current);
    }
    if (!current || !cell.isa) continue;

    // "ISA", "ISA-15", "ISA +10", "ISA +17.5" — the sign is sometimes spaced.
    const m = cell.isa.replace(/\s+/g, "").match(/^ISA([+-]?[\d.]+)?$/i);
    if (!m) throw new Error(`${figure}: unreadable ISA label "${cell.isa}"`);
    current.rows.push({
      isaDev: m[1] ? Number(m[1]) : 0,
      oatC: num(cell.c),
      oatF: num(cell.f),
      rpm: num(cell.rpm),
      ktas: num(cell.kt),
    });
  }

  return { figure, power, gph, altitudes };
}

// ---------------------------------------------------------------- validation

function validate(t) {
  const problems = [];
  let rows = 0, withTas = 0;
  for (const a of t.altitudes) {
    if (!a.rows.length) problems.push(`${t.figure}: ${a.alt} ft has no rows`);
    let lastDev = -Infinity, lastRpm = -Infinity;
    for (const r of a.rows) {
      rows++;
      if (r.ktas !== null) withTas++;
      if (r.oatC === null || r.rpm === null) {
        problems.push(`${t.figure} ${a.alt}ft ISA${r.isaDev}: missing °C or RPM`);
        continue;
      }
      // Fahrenheit must agree with Celsius (Piper rounds to the whole degree).
      const f = r.oatC * 9 / 5 + 32;
      if (r.oatF === null || Math.abs(f - r.oatF) > 0.6) {
        problems.push(`${t.figure} ${a.alt}ft ISA${r.isaDev}: ${r.oatC}°C is ${f.toFixed(1)}°F, table says ${r.oatF}`);
      }
      // The stated deviation must agree with the standard lapse rate.
      const expect = isaTemp(a.alt) + r.isaDev;
      if (Math.abs(expect - r.oatC) > 1.1) {
        problems.push(`${t.figure} ${a.alt}ft ISA${r.isaDev}: expected ${expect.toFixed(1)}°C, table says ${r.oatC}`);
      }
      // Warmer air, higher RPM for the same percentage power.
      if (r.isaDev <= lastDev) problems.push(`${t.figure} ${a.alt}ft: ISA deviations out of order`);
      if (r.rpm < lastRpm) problems.push(`${t.figure} ${a.alt}ft: RPM falls as it warms`);
      lastDev = r.isaDev; lastRpm = r.rpm;
    }
  }
  return { problems, rows, withTas };
}

const tables = PAGES.map(table);
let bad = 0;
for (const t of tables) {
  const { problems, rows, withTas } = validate(t);
  console.log(`figure ${t.figure} (${t.power}%): ${t.altitudes.length} altitudes, ${rows} rows, ${withTas} with TAS`);
  for (const p of problems) { console.error("  ! " + p); bad++; }
}
if (bad) {
  console.error(`\n${bad} problem(s) — refusing to write.`);
  process.exit(1);
}

const body = `// Generated by scripts/pohtrace/cruise/extract.mjs — do not edit by hand.
//
// Figures 5-21, 5-23 and 5-25 of the PA-28-181 POH (Piper VB-2960, 16 November
// 2020): engine and cruise performance at 55%, 65% and 75% power, best economy
// mixture, 2,550 lb.
//
// These three figures are tables and the PDF carries a text layer for them, so
// unlike the graph digitisations elsewhere in this app these numbers are Piper's
// own — read out of the file, not measured off a scan. Every row is checked on
// extraction against two identities printed in the table itself: °F against °C,
// and the stated ISA deviation against the standard lapse rate.
//
// True airspeed is printed only at the coldest and warmest row of each altitude
// block, which is how Piper set it — at constant power it barely moves with
// temperature, so they gave the two ends and left the middle to the eye.

export interface CruiseRow {
  /** Deviation from standard temperature, °C. */
  isaDev: number;
  oatC: number;
  oatF: number;
  rpm: number;
  /** Knots true airspeed, where the table prints it. */
  ktas: number | null;
}

export interface CruiseAltitude {
  /** Pressure altitude, feet. */
  alt: number;
  rows: CruiseRow[];
}

export interface CruiseTable {
  figure: string;
  /** Percentage of rated power. */
  power: number;
  /** Best economy mixture fuel flow, US gallons per hour. */
  gph: number;
  altitudes: CruiseAltitude[];
}

export const CRUISE_TABLES: CruiseTable[] = ${JSON.stringify(tables, null, 2)};
`;

fs.writeFileSync(OUT, body);
console.log(`\nwrote ${path.relative(process.cwd(), OUT)}`);

// The iOS app reads the same figures from a bundled JSON, the same way it does
// the climb and descent charts: one extraction, two apps, nothing to keep in
// step. Set IOS_DATA_DIR to point somewhere else.
const IOS = process.env.IOS_DATA_DIR ??
  path.resolve(HERE, "../../../../../../pilot-logbook-ios/PilotLogbook/Data");
if (fs.existsSync(IOS)) {
  const file = path.join(IOS, "pa28-181-cruise.json");
  fs.writeFileSync(file, JSON.stringify(tables));
  console.log(`wrote ${file}`);
} else {
  console.log(`note: no iOS data directory at ${IOS} — skipped the app's copy`);
}

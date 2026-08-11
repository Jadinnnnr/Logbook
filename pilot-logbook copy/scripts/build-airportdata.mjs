// Builds data/airports.db — runways, frequencies, published procedures, and
// fuel/repair services for airports in the contiguous United States.
//
// Sources, all public domain:
//   • OurAirports (airports / runways / airport-frequencies CSVs)
//   • FAA d-TPP metafile — instrument procedures and airport diagram PDFs
//   • FAA NASR APT.txt — fuel types and repair services (optional)
//
// Usage: node scripts/build-airportdata.mjs [path/to/dir/with/APT.txt]
import fs from "fs";
import path from "path";
import readline from "readline";
import os from "os";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const aptDir = process.argv[2] || null;
const OA = "https://davidmegginson.github.io/ourairports-data/";

// Contiguous US only: everything in US-* except Alaska and Hawaii. OurAirports
// files territories under their own ISO country codes, so they drop out anyway.
const EXCLUDED_REGIONS = new Set(["US-AK", "US-HI", "US-U-A"]);

/** Machine-readable progress for the orchestrator — see build-reference.mjs. */
function progress(done, total, label) {
  console.log(`##PROGRESS ${done} ${total} ${label}`);
}
const STAGES = ["airports", "runways", "frequencies", "procedures", "navdata"];

const outPath = path.join("data", "airports.db");
fs.mkdirSync("data", { recursive: true });
fs.rmSync(outPath, { force: true });
const db = new Database(outPath);
db.pragma("journal_mode = OFF");
db.pragma("synchronous = OFF");
db.exec(`
CREATE TABLE airports (
  ident TEXT PRIMARY KEY, name TEXT, city TEXT, region TEXT,
  lat REAL, lon REAL, elev_ft INTEGER, type TEXT, local_code TEXT,
  fuel TEXT, airframe_repair TEXT, powerplant_repair TEXT,
  cs_volume TEXT
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE runways (
  ident TEXT, le_ident TEXT, he_ident TEXT, length_ft INTEGER, width_ft INTEGER,
  surface TEXT, lighted INTEGER, le_heading REAL, he_heading REAL
);
CREATE INDEX idx_runways_ident ON runways(ident);
CREATE TABLE freqs (ident TEXT, type TEXT, description TEXT, mhz TEXT);
CREATE INDEX idx_freqs_ident ON freqs(ident);
CREATE TABLE charts (ident TEXT, code TEXT, name TEXT, url TEXT);
CREATE INDEX idx_charts_ident ON charts(ident);
`);

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastError;
}

/** CSV rows, honouring quoted fields. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

function asRows(text) {
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// ---------- Airports ----------
console.log("Fetching OurAirports data…");
const airports = asRows(await fetchText(OA + "airports.csv")).filter(
  (a) =>
    a.iso_country === "US" &&
    !EXCLUDED_REGIONS.has(a.iso_region) &&
    ["small_airport", "medium_airport", "large_airport", "seaplane_base", "heliport"].includes(a.type)
);
const keep = new Set(airports.map((a) => a.ident));
const insAirport = db.prepare(
  "INSERT OR IGNORE INTO airports (ident,name,city,region,lat,lon,elev_ft,type,local_code) VALUES (?,?,?,?,?,?,?,?,?)"
);
db.transaction(() => {
  for (const a of airports) {
    insAirport.run(
      a.ident, a.name, a.municipality, a.iso_region.replace("US-", ""),
      parseFloat(a.latitude_deg), parseFloat(a.longitude_deg),
      a.elevation_ft ? parseInt(a.elevation_ft, 10) : null,
      a.type, a.local_code || a.gps_code || ""
    );
  }
})();
console.log(`  airports: ${airports.length}`);
progress(1, STAGES.length, "airports");

// ---------- Runways ----------
const runways = asRows(await fetchText(OA + "runways.csv")).filter((r) => keep.has(r.airport_ident));
const insRunway = db.prepare(
  "INSERT INTO runways (ident,le_ident,he_ident,length_ft,width_ft,surface,lighted,le_heading,he_heading) VALUES (?,?,?,?,?,?,?,?,?)"
);
db.transaction(() => {
  for (const r of runways) {
    insRunway.run(
      r.airport_ident, r.le_ident, r.he_ident,
      r.length_ft ? parseInt(r.length_ft, 10) : null,
      r.width_ft ? parseInt(r.width_ft, 10) : null,
      r.surface, r.lighted === "1" ? 1 : 0,
      r.le_heading_degT ? parseFloat(r.le_heading_degT) : null,
      r.he_heading_degT ? parseFloat(r.he_heading_degT) : null
    );
  }
})();
console.log(`  runways: ${runways.length}`);
progress(2, STAGES.length, "runways");

// ---------- Frequencies ----------
const freqs = asRows(await fetchText(OA + "airport-frequencies.csv")).filter((f) => keep.has(f.airport_ident));
const insFreq = db.prepare("INSERT INTO freqs (ident,type,description,mhz) VALUES (?,?,?,?)");
db.transaction(() => {
  for (const f of freqs) insFreq.run(f.airport_ident, f.type, f.description, f.frequency_mhz);
})();
console.log(`  frequencies: ${freqs.length}`);
progress(3, STAGES.length, "frequencies");

// ---------- Published procedures (FAA d-TPP) ----------
/** The metafile lives under a 4-digit cycle; find the newest one published. */
async function currentCycle() {
  const now = new Date();
  const yy = now.getFullYear() % 100;
  const candidates = [];
  for (let y of [yy, yy - 1]) for (let c = 14; c >= 1; c--) candidates.push(`${y}${String(c).padStart(2, "0")}`);
  for (const cycle of candidates) {
    try {
      const res = await fetch(`https://aeronav.faa.gov/d-tpp/${cycle}/xml_data/d-tpp_Metafile.xml`, {
        method: "HEAD",
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return cycle;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

const cycle = await currentCycle();
let nCharts = 0;
if (!cycle) {
  console.warn("  d-TPP: no published cycle found — skipping procedures");
} else {
  console.log(`  d-TPP cycle ${cycle}…`);
  const xml = await fetchText(`https://aeronav.faa.gov/d-tpp/${cycle}/xml_data/d-tpp_Metafile.xml`);
  const insChart = db.prepare("INSERT INTO charts (ident,code,name,url) VALUES (?,?,?,?)");
  const setVolume = db.prepare("UPDATE airports SET cs_volume = ? WHERE ident = ?");
  db.transaction(() => {
    // Airports sit inside <city_name … volume="SW-2">, which names the Chart
    // Supplement volume covering them. Split on city so each airport inherits
    // the volume of the city block it actually appears in.
    for (const cityBlock of xml.split(/<city_name\b/).slice(1)) {
      const volume = (cityBlock.match(/volume="([^"]*)"/)?.[1] ?? "").split("-")[0].trim();
      for (const block of cityBlock.split(/<airport_name\b/).slice(1)) {
      const icao = block.match(/icao_ident="([^"]*)"/)?.[1]?.trim();
      const apt = block.match(/apt_ident="([^"]*)"/)?.[1]?.trim();
      const ident = keep.has(icao) ? icao : keep.has(apt) ? apt : null;
      if (!ident) continue;
      if (volume) setVolume.run(volume, ident);
      for (const rec of block.split(/<record>/).slice(1)) {
        const code = rec.match(/<chart_code>([^<]*)<\/chart_code>/)?.[1]?.trim() ?? "";
        const name = rec.match(/<chart_name>([^<]*)<\/chart_name>/)?.[1]?.trim() ?? "";
        const pdf = rec.match(/<pdf_name>([^<]*)<\/pdf_name>/)?.[1]?.trim() ?? "";
        // Approaches and the airport diagram are what the app shows.
        if (!["IAP", "APD"].includes(code) || !pdf || pdf.toUpperCase() === "DELETED_JOB.PDF") continue;
        insChart.run(ident, code, name, `https://aeronav.faa.gov/d-tpp/${cycle}/${pdf}`);
        nCharts++;
      }
      }
    }
  })();
  console.log(`  procedures + diagrams: ${nCharts}`);
}

// ---------- Fuel and repair services (FAA NASR APT.txt) ----------
/** Fetch and unzip the current NASR airport file when no local copy is given. */
async function downloadApt() {
  const { execFileSync } = await import("child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nasr-apt-"));
  // NASR subscriptions are published on 28-day cycle dates, not daily, so walk
  // back far enough to be certain of crossing one (a full cycle plus slack).
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const stamp = d.toISOString().slice(0, 10);
    const url = `https://nfdc.faa.gov/webContent/28DaySub/${stamp}/APT.zip`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
      if (!res.ok) continue;
      const zip = path.join(dir, "APT.zip");
      fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
      execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
      if (fs.existsSync(path.join(dir, "APT.txt"))) {
        console.log(`  services: using NASR subscription ${stamp}`);
        return dir;
      }
    } catch {
      /* try an earlier date */
    }
  }
  return null;
}

const servicesDir = aptDir ?? (await downloadApt());
if (!servicesDir) {
  console.log("  services: skipped (no NASR APT.txt available)");
} else {
  const file = path.join(servicesDir, "APT.txt");
  const update = db.prepare(
    "UPDATE airports SET fuel = ?, airframe_repair = ?, powerplant_repair = ? WHERE ident = ? OR local_code = ?"
  );
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "latin1" }), crlfDelay: Infinity });
  let nServices = 0;
  const pending = [];
  for await (const line of rl) {
    if (!line.startsWith("APT")) continue;
    const locId = line.slice(27, 31).trim();
    if (!locId) continue;
    // Fixed-width: fuel types occupy 900–939 as five-character codes, then
    // airframe and powerplant repair.
    const fuel = (line.slice(900, 940).match(/.{1,5}/g) ?? []).map((c) => c.trim()).filter(Boolean).join(", ");
    const airframe = line.slice(940, 945).trim();
    const powerplant = line.slice(945, 950).trim();
    if (!fuel && !airframe && !powerplant) continue;
    pending.push([fuel, airframe, powerplant, `K${locId}`, locId]);
  }
  db.transaction(() => {
    for (const args of pending) {
      const res = update.run(...args);
      if (res.changes) nServices++;
    }
  })();
  console.log(`  services matched: ${nServices}`);
}

// ---------- Chart Supplement edition ----------
// The FAA publishes the Chart Supplement as one PDF per volume per 56-day
// edition; capture the edition currently in effect so airports can link to it.
let csEffective = "";
try {
  const page = await fetchText(
    "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dafd/"
  );
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const dates = [...new Set([...page.matchAll(/supplements\/CS_[A-Z]+_(\d{8})\.(?:pdf|zip)/g)].map((m) => m[1]))]
    .sort();
  csEffective = dates.filter((d) => d <= today).pop() ?? dates[0] ?? "";
  console.log(`  chart supplement edition: ${csEffective || "unknown"}`);
} catch (e) {
  console.warn(`  chart supplement edition lookup failed (${e.message})`);
}

const setMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
setMeta.run("built_at", new Date().toISOString());
setMeta.run("dtpp_cycle", cycle ?? "");
setMeta.run("cs_effective", csEffective);
setMeta.run("airports", String(airports.length));

db.exec("VACUUM");
db.close();
console.log(`\nWrote ${outPath} (${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB)`);

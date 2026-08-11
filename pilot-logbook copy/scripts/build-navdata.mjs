// Builds lib/navdata-data.json from FAA NASR legacy subscriber files
// (https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/).
// Usage: node scripts/build-navdata.mjs /path/to/nasr-dir   (containing FIX.txt NAV.txt AWY.txt)
// Output: { fixes: {IDENT:[lat,lon]}, navs: {IDENT:[lat,lon]}, airways: {NAME:[[key,lat,lon],...]} }
// US coverage only (NASR is the US National Airspace System Resource).
import fs from "fs";
import path from "path";
import readline from "readline";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/build-navdata.mjs <nasr-dir>");

const round = (n) => Math.round(n * 1e4) / 1e4;

function dms(s) {
  // "34-36-21.290N" / "087-16-24.750W" -> signed decimal degrees
  const m = /^(\d{1,3})-(\d{2})-(\d{2}(?:\.\d+)?)([NSEW])$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  return round(m[4] === "S" || m[4] === "W" ? -v : v);
}

async function eachLine(file, fn) {
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(dir, file)),
    crlfDelay: Infinity,
  });
  for await (const line of rl) fn(line);
}

// --- FIX1: ident cols 4-33, lat 66-79, lon 80-93 ---
const fixes = {};
let nFix = 0;
await eachLine("FIX.txt", (line) => {
  if (!line.startsWith("FIX1")) return;
  const ident = line.slice(4, 34).trim();
  const lat = dms(line.slice(66, 80));
  const lon = dms(line.slice(80, 94));
  if (!ident || lat === null || lon === null) return;
  if (!(ident in fixes)) {
    fixes[ident] = [lat, lon];
    nFix++;
  }
});

// --- NAV1: ident cols 4-7; first lat/lon DMS pair found in the record ---
const navs = {};
let nNav = 0;
// Degree boundaries matter: fields like "CAK237-36-19.91N" prefix the DMS with
// a region code, so a leading digit must not be absorbed into the degrees.
const latRe = /(?:^|[^\d])(\d{2}-\d{2}-\d{2}(?:\.\d+)?[NS])/;
const lonRe = /(?:^|[^\d])(\d{2,3}-\d{2}-\d{2}(?:\.\d+)?[EW])/;
await eachLine("NAV.txt", (line) => {
  if (!line.startsWith("NAV1")) return;
  const ident = line.slice(4, 8).trim();
  const latM = latRe.exec(line);
  const lonM = lonRe.exec(line);
  if (!ident || !latM || !lonM) return;
  const lat = dms(latM[1]);
  const lon = dms(lonM[1]);
  if (lat === null || lon === null) return;
  if (!(ident in navs)) {
    navs[ident] = [lat, lon];
    nNav++;
  }
});

// --- AWY2 fixed columns: airway 4-9 (incl. area suffix), seq 10-14,
// point name 15-44, point type 45-78, state 79-80, ICAO region 81-82,
// lat 83-96, lon 97-110, navaid ident 111-118. ---
const airwaySegs = {}; // full designation ("V334", "V334 A") -> [{seq,key,lat,lon}]
await eachLine("AWY.txt", (line) => {
  if (!line.startsWith("AWY2")) return;
  const awy = line.slice(4, 10).trim();
  const seq = parseInt(line.slice(10, 15), 10);
  const name = line.slice(15, 45).trim();
  const lat = dms(line.slice(83, 97));
  const lon = dms(line.slice(97, 111));
  if (!awy || isNaN(seq) || lat === null || lon === null) return;
  // Key used to match route tokens: fixes go by their 5-letter name; navaids by
  // the ident column (the name column holds the spelled-out navaid name).
  const navIdent = line.slice(111, 119).trim();
  const key = navIdent || name;
  (airwaySegs[awy] ??= []).push({ seq, key, lat, lon });
});

// Order each airway's points; store base name and any area variants under
// distinct keys ("V334", "V334 A").
const airways = {};
for (const [awy, pts] of Object.entries(airwaySegs)) {
  pts.sort((a, b) => a.seq - b.seq);
  airways[awy] = pts.map((p) => [p.key, p.lat, p.lon]);
}

const out = { fixes, navs, airways };
const outPath = "lib/navdata-data.json";
fs.writeFileSync(outPath, JSON.stringify(out));
console.log("fixes:", nFix, "navs:", nNav, "airways:", Object.keys(airways).length,
  "bytes:", fs.statSync(outPath).size);

// Builds lib/airports-data.json from the public-domain OurAirports dataset
// (https://ourairports.com/data/). Usage:
//   node scripts/build-airports.mjs /path/to/airports.csv
// Output maps every usable identifier (ICAO ident, GPS code, IATA, local code)
// to [lat, lon, name].
import fs from "fs";

const src = process.argv[2];
if (!src) throw new Error("usage: node scripts/build-airports.mjs airports.csv");
const text = fs.readFileSync(src, "utf8");

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

const rows = parseCsv(text);
const header = rows[0];
const col = (name) => header.indexOf(name);
const iIdent = col("ident"), iType = col("type"), iName = col("name"),
  iLat = col("latitude_deg"), iLon = col("longitude_deg"),
  iGps = col("gps_code"), iIata = col("iata_code"), iLocal = col("local_code");

const out = {};
let n = 0;
for (const r of rows.slice(1)) {
  if (r[iType] === "closed") continue;
  const lat = parseFloat(r[iLat]), lon = parseFloat(r[iLon]);
  if (isNaN(lat) || isNaN(lon)) continue;
  const name = (r[iName] || "").slice(0, 48);
  const entry = [Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, name];
  n++;
  // First writer wins for a code: idents are processed in file order, and the
  // primary ident is the most authoritative, so never overwrite.
  for (const code of [r[iIdent], r[iGps], r[iIata], r[iLocal]]) {
    const c = (code || "").trim().toUpperCase();
    if (c && !(c in out)) out[c] = entry;
  }
}

fs.writeFileSync("lib/airports-data.json", JSON.stringify(out));
console.log("airports:", n, "codes:", Object.keys(out).length,
  "bytes:", fs.statSync("lib/airports-data.json").size);

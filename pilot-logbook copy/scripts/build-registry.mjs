// Builds data/faa-registry.db from the FAA Aircraft Registration database
// (https://registry.faa.gov/database/ReleasableAircraft.zip — public domain).
// Usage: node scripts/build-registry.mjs <dir with MASTER.txt ACFTREF.txt ENGINE.txt>
//
// Kept in SQLite rather than JSON: the master file holds ~300k registrations,
// and three normalized tables with indexes stay small and load lazily, whereas
// an equivalent JSON blob would be tens of megabytes parsed on every boot.
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { execFileSync } from "child_process";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const REGISTRY_ZIP = "https://registry.faa.gov/database/ReleasableAircraft.zip";

/**
 * Fetch and unzip the FAA registration database when no local copy is given,
 * so an unattended refresh doesn't need a manual download first.
 */
async function downloadRegistry() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "faa-registry-"));
  console.log("Downloading the FAA aircraft registry (~73 MB)…");
  const res = await fetch(REGISTRY_ZIP, {
    headers: { "User-Agent": "pilot-logbook/1.0 (personal logbook app)" },
    signal: AbortSignal.timeout(900000),
  });
  if (!res.ok) throw new Error(`${res.status} fetching ${REGISTRY_ZIP}`);
  const zip = path.join(target, "registry.zip");
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", zip, "-d", target]);
  for (const needed of ["MASTER.txt", "ACFTREF.txt", "ENGINE.txt"]) {
    if (!fs.existsSync(path.join(target, needed))) {
      throw new Error(`${needed} missing from the downloaded registry archive`);
    }
  }
  return target;
}

const dir = process.argv[2] ?? (await downloadRegistry());

const outPath = path.join("data", "faa-registry.db");
fs.mkdirSync("data", { recursive: true });
fs.rmSync(outPath, { force: true });
const db = new Database(outPath);
db.pragma("journal_mode = OFF");
db.pragma("synchronous = OFF");
db.exec(`
CREATE TABLE acftref (code TEXT PRIMARY KEY, make TEXT, model TEXT, category_class TEXT);
CREATE TABLE engine (code TEXT PRIMARY KEY, horsepower INTEGER);
CREATE TABLE registry (n_number TEXT PRIMARY KEY, mdl_code TEXT, eng_code TEXT, year INTEGER);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
`);

/**
 * FAA TYPE-ACFT + AC-CAT to an FAA category/class code.
 * TYPE-ACFT: 1 glider, 2 balloon, 3 blimp, 4 fixed-wing single, 5 fixed-wing
 * multi, 6 rotorcraft, 7 weight-shift, 8 powered parachute, 9 gyroplane,
 * H hybrid lift. AC-CAT: 1 land, 2 sea, 3 amphibian.
 */
function categoryClass(typeAcft, acCat) {
  const sea = acCat === "2" || acCat === "3"; // amphibians are flown as seaplanes
  switch (typeAcft) {
    case "4": return sea ? "ASES" : "ASEL";
    case "5": return sea ? "AMES" : "AMEL";
    case "6": return "RH";
    case "9": return "RG";
    case "1": return "GL";
    case "2":
    case "3": return "LTA";
    case "H": return "PL";
    default: return ""; // weight-shift and powered parachute have no logbook class here
  }
}

async function eachLine(file, fn) {
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(dir, file)),
    crlfDelay: Infinity,
  });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; } // header
    if (line.trim()) fn(line);
  }
}

const insAcft = db.prepare("INSERT OR IGNORE INTO acftref VALUES (?,?,?,?)");
let nAcft = 0;
db.exec("BEGIN");
await eachLine("ACFTREF.txt", (line) => {
  const f = line.split(",");
  if (f.length < 7) return;
  const code = f[0].trim();
  const make = f[1].trim();
  const model = f[2].trim();
  const cc = categoryClass(f[3].trim(), f[5].trim());
  if (!code) return;
  insAcft.run(code, make, model, cc);
  nAcft++;
});
db.exec("COMMIT");

const insEng = db.prepare("INSERT OR IGNORE INTO engine VALUES (?,?)");
let nEng = 0;
db.exec("BEGIN");
await eachLine("ENGINE.txt", (line) => {
  const f = line.split(",");
  if (f.length < 5) return;
  const code = f[0].trim();
  const hp = parseInt(f[4].trim(), 10);
  if (!code) return;
  insEng.run(code, isNaN(hp) ? null : hp);
  nEng++;
});
db.exec("COMMIT");

// Only the first four MASTER fields are read, all of which precede the free-text
// owner name/address columns that can themselves contain commas.
const insReg = db.prepare("INSERT OR IGNORE INTO registry VALUES (?,?,?,?)");
let nReg = 0;
let skipped = 0;
db.exec("BEGIN");
await eachLine("MASTER.txt", (line) => {
  const f = line.split(",", 5);
  const n = f[0]?.trim();
  const mdl = f[2]?.trim();
  const eng = f[3]?.trim();
  const year = parseInt(f[4]?.trim(), 10);
  // Model codes are alphanumeric (e.g. "2072434" and "05639MP" are both valid).
  if (!n || !mdl || !/^[0-9A-Z]+$/i.test(mdl)) { skipped++; return; }
  insReg.run(n.toUpperCase(), mdl, eng || null, isNaN(year) ? null : year);
  nReg++;
});
db.exec("COMMIT");

const setMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
setMeta.run("built_at", new Date().toISOString());
setMeta.run("registrations", String(nReg));
db.exec("VACUUM");
db.close();
console.log(
  `acftref: ${nAcft}  engine: ${nEng}  registrations: ${nReg} (skipped ${skipped})  ` +
  `size: ${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB`
);

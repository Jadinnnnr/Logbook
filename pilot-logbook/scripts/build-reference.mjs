// Builds data/reference.db — a full-text searchable copy of the pilot-relevant
// FARs (14 CFR, from the public eCFR API) and the FAA's Aeronautical
// Information Manual (public HTML). Both are US government works.
//
// Usage: node scripts/build-reference.mjs
// Re-run occasionally; both sources are amended on their own schedules.
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

/**
 * eCFR only serves dates it has actually issued, so ask which one is current
 * rather than assuming today — requesting today's date 404s every part.
 */
async function latestCfrDate() {
  if (process.env.CFR_DATE) return process.env.CFR_DATE;
  const res = await fetch("https://www.ecfr.gov/api/versioner/v1/titles.json");
  const data = await res.json();
  const title14 = data.titles.find((t) => t.number === 14);
  return title14?.latest_issue_date ?? new Date().toISOString().slice(0, 10);
}
const CFR_DATE = await latestCfrDate();
console.log(`Using eCFR issue date ${CFR_DATE}`);
const PARTS = [1, 43, 61, 67, 68, 71, 73, 91, 97, 103, 105, 107, 117, 119, 121, 135, 141, 142];
const AIM_INDEX = "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/index.html";
const AIM_BASE = "https://www.faa.gov/air_traffic/publications/atpubs/aim_html/";

const outPath = path.join("data", "reference.db");
fs.mkdirSync("data", { recursive: true });
fs.rmSync(outPath, { force: true });
const db = new Database(outPath);
db.exec(`
CREATE VIRTUAL TABLE docs USING fts5(
  source,      -- 'FAR' or 'AIM'
  citation,    -- '14 CFR 61.57' / 'AIM 5-4-1'
  title,
  body,
  url UNINDEXED,
  tokenize = "porter unicode61"
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
`);
const insert = db.prepare("INSERT INTO docs (source, citation, title, body, url) VALUES (?,?,?,?,?)");

/** Both sources occasionally drop a connection; retry a few times before giving up. */
async function fetchText(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "pilot-logbook/1.0 (personal logbook app)" },
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastError;
}

/** Collapse markup and entities into readable plain text. */
function toText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:rsquo|lsquo|apos);/g, "'")
    .replace(/&(?:rdquo|ldquo);/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&sect;/g, "§")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- FARs ----------
let nFar = 0;
for (const part of PARTS) {
  let xml;
  try {
    xml = await fetchText(
      `https://www.ecfr.gov/api/versioner/v1/full/${CFR_DATE}/title-14.xml?part=${part}`
    );
  } catch (e) {
    console.warn(`  part ${part}: ${e.message} — skipped`);
    continue;
  }
  // Each section is a <DIV8 ... TYPE="SECTION"> with a <HEAD> like "§ 61.57 ...".
  const sections = xml.split(/<DIV8\b/).slice(1);
  let inPart = 0;
  for (const chunk of sections) {
    if (!/TYPE="SECTION"/.test(chunk.slice(0, 400))) continue;
    const headMatch = chunk.match(/<HEAD>([\s\S]*?)<\/HEAD>/);
    if (!headMatch) continue;
    const head = toText(headMatch[1]);
    const num = head.match(/§+\s*([\d.]+[a-zA-Z-]*)/)?.[1];
    if (!num) continue;
    const title = head.replace(/^§+\s*[\d.]+[a-zA-Z-]*\s*/, "").trim();
    const body = toText(chunk.replace(/<HEAD>[\s\S]*?<\/HEAD>/, ""));
    if (!body) continue;
    insert.run(
      "FAR",
      `14 CFR ${num}`,
      title,
      body,
      `https://www.ecfr.gov/current/title-14/section-${num}`
    );
    nFar++;
    inPart++;
  }
  console.log(`  14 CFR part ${part}: ${inPart} sections`);
}

// ---------- AIM ----------
let nAim = 0;
try {
  const index = await fetchText(AIM_INDEX);
  const hrefs = [...new Set([...index.matchAll(/href="(chap[^"]*?\.html)"/gi)].map((m) => m[1]))];
  for (const href of hrefs) {
    let html;
    try {
      html = await fetchText(AIM_BASE + href);
    } catch (e) {
      console.warn(`  ${href}: ${e.message} — skipped`);
      continue;
    }
    const pageTitle = toText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? href);
    // Each numbered paragraph starts a searchable unit: "5-4-1. Air Traffic..."
    const text = toText(html.replace(/<head[\s\S]*?<\/head>/i, " "));
    const parts = text.split(/(?=^\d+[-−]\d+[-−]\d+\.\s)/m).filter((p) => p.trim());
    for (const chunk of parts) {
      const m = chunk.match(/^(\d+)[-−](\d+)[-−](\d+)\.\s*([^\n]*)/);
      if (!m) continue;
      const citation = `AIM ${m[1]}-${m[2]}-${m[3]}`;
      const body = chunk.trim();
      if (body.length < 40) continue;
      insert.run("AIM", citation, m[4].trim().slice(0, 200), body, AIM_BASE + href);
      nAim++;
    }
    if (parts.length <= 1) {
      // A chapter page without numbered paragraphs still gets one entry.
      insert.run("AIM", pageTitle.slice(0, 80), pageTitle.slice(0, 200), text, AIM_BASE + href);
      nAim++;
    }
  }
} catch (e) {
  console.warn(`AIM index failed (${e.message}) — FARs only`);
}

const setMeta = db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)");
setMeta.run("built_at", new Date().toISOString());
setMeta.run("cfr_date", CFR_DATE);
setMeta.run("far_sections", String(nFar));
setMeta.run("aim_entries", String(nAim));
db.exec("INSERT INTO docs(docs) VALUES('optimize')");
db.close();
console.log(
  `\nFAR sections: ${nFar}  AIM entries: ${nAim}  size: ${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB`
);

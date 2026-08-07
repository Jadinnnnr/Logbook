import "server-only";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Full-text search over the FARs and AIM indexed by scripts/build-reference.mjs.
 * The database is optional — without it the page explains how to build it
 * rather than erroring.
 */

export interface ReferenceHit {
  source: string;
  citation: string;
  title: string;
  snippet: string;
  body: string;
  url: string;
}

let cached: Database.Database | null | undefined;

function referenceDb(): Database.Database | null {
  if (cached !== undefined) return cached;
  const file = path.join(process.cwd(), "data", "reference.db");
  cached = fs.existsSync(file) ? new Database(file, { readonly: true, fileMustExist: true }) : null;
  return cached;
}

export function referenceAvailable(): boolean {
  return referenceDb() !== null;
}

export function referenceCounts(): { far: number; aim: number } {
  const db = referenceDb();
  if (!db) return { far: 0, aim: 0 };
  const count = (source: string) =>
    (db.prepare("SELECT COUNT(*) AS c FROM docs WHERE source = ?").get(source) as { c: number }).c;
  return { far: count("FAR"), aim: count("AIM") };
}

/**
 * Turn a user's words into an FTS5 query. Everything is quoted so punctuation
 * common in citations ("61.57", "§") can't be read as FTS operators, and a
 * trailing prefix match makes partial words find something as you type.
 */
function toMatchQuery(raw: string): string | null {
  const terms = raw
    .toLowerCase()
    .split(/[^a-z0-9.§()-]+/i)
    .map((t) => t.replace(/["]/g, "").trim())
    .filter(Boolean);
  if (terms.length === 0) return null;
  const all = terms.map((t, i) => (i === terms.length - 1 ? `"${t}"*` : `"${t}"`)).join(" AND ");
  // Prefer the exact phrase where it exists, but still find documents that
  // merely contain all the words.
  return terms.length > 1 ? `"${terms.join(" ")}" OR (${all})` : all;
}

/** The source chip already says AIM, so don't repeat it in the citation. */
export function displayCitation(hit: { source: string; citation: string }): string {
  return hit.source === "AIM" ? hit.citation.replace(/^AIM\s+/, "") : hit.citation;
}

export function searchReference(query: string, source: string, limit = 25): ReferenceHit[] {
  const db = referenceDb();
  if (!db) return [];
  const match = toMatchQuery(query);
  if (!match) return [];

  const filter = source === "FAR" || source === "AIM" ? " AND source = ?" : "";
  const args: (string | number)[] = filter ? [match, source, limit] : [match, limit];
  try {
    return db
      .prepare(
        `SELECT source, citation, title, url, body,
                snippet(docs, 3, '<mark>', '</mark>', '…', 28) AS snippet
           FROM docs
          WHERE docs MATCH ?${filter}
          ORDER BY bm25(docs, 8.0, 12.0, 6.0, 1.0)
          LIMIT ?`
      )
      .all(...args) as ReferenceHit[];
  } catch {
    // Malformed FTS expressions shouldn't surface as a crash.
    return [];
  }
}

/** Exact citation lookup, so "91.103" jumps straight to the section. */
export function lookupCitation(query: string): ReferenceHit | null {
  const db = referenceDb();
  if (!db) return null;
  const m = query.trim().match(/^(?:14\s*cfr\s*|far\s*|§\s*)?(\d{1,3}\.\d+[a-z-]*)$/i);
  if (!m) return null;
  const row = db
    .prepare(
      `SELECT source, citation, title, url, body, '' AS snippet
         FROM docs WHERE source = 'FAR' AND citation = ? LIMIT 1`
    )
    .get(`14 CFR ${m[1]}`) as ReferenceHit | undefined;
  return row ?? null;
}

/**
 * The current text for a stored citation.
 *
 * Returns null when the citation is no longer in the dataset — a rebuilt
 * reference.db can renumber or drop a section, and a bookmark pointing at one
 * that's gone should disappear from the list rather than show stale text.
 */
export function lookupBySourceCitation(source: string, citation: string): ReferenceHit | null {
  const db = referenceDb();
  if (!db || !source || !citation) return null;
  const row = db
    .prepare(
      `SELECT source, citation, title, url, body, '' AS snippet
         FROM docs WHERE source = ? AND citation = ? LIMIT 1`
    )
    .get(source, citation) as ReferenceHit | undefined;
  return row ?? null;
}

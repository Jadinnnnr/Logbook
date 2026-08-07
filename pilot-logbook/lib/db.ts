import Database from "better-sqlite3";
import type { BackupArchive } from "./backup.ts";
import { BACKUP_VERSION } from "./backup.ts";
import fs from "fs";
import path from "path";
// Explicit extension so the test scripts can load this module under Node's
// native TypeScript support, which requires it for relative ESM imports.
import { nameError } from "./username.ts";

export interface User {
  id: number;
  email: string;
  /**
   * The pilot's single identity: shown as their display name and accepted in
   * place of the email at sign-in. Unique case-insensitively. The legacy `name`
   * column is kept in step with it so the NOT NULL constraint stays satisfied.
   */
  username: string;
  name: string;
  password_hash: string;
  /** Legacy fields, superseded by the medicals / endorsements tables. */
  medical_expiry: string | null;
  flight_review_date: string | null;
  theme: string;
  /** One of ACCENTS, or "custom" — in which case accent_custom holds the hex. */
  accent: string;
  accent_custom: string | null;
  /** Needed for 61.23(d) medical privilege durations (age at date of exam). */
  date_of_birth: string | null;
  /** Profile picture bytes and their MIME type, or null when unset. */
  avatar: Buffer | null;
  avatar_type: string | null;
  /** Bumped on every upload; used to bust the browser's cache of /api/avatar. */
  avatar_version: string | null;
  created_at: string;
}

export interface Certificate {
  id: number;
  user_id: number;
  kind: string; // 'certificate' | 'rating'
  name: string;
  number: string;
  issued_date: string;
  expires_date: string;
  /** Earned by a practical test, which resets the flight review under 61.56(d). */
  resets_flight_review: number;
  notes: string;
  created_at: string;
}

export interface Medical {
  id: number;
  user_id: number;
  medical_class: string;
  exam_date: string;
  expires_date: string;
  examiner: string;
  notes: string;
  created_at: string;
}

export interface Endorsement {
  id: number;
  user_id: number;
  endorsement_type: string;
  date: string;
  expires_date: string;
  instructor_name: string;
  instructor_cert: string;
  notes: string;
  created_at: string;
}

export const MEDICAL_CLASSES = [
  "First class",
  "Second class",
  "Third class",
  "BasicMed",
  "Unspecified",
];

export const CERTIFICATE_SUGGESTIONS = [
  "Student Pilot",
  "Sport Pilot",
  "Recreational Pilot",
  "Private Pilot",
  "Commercial Pilot",
  "Airline Transport Pilot",
  "Flight Instructor (CFI)",
  "Flight Instructor — Instrument (CFII)",
  "Multi-Engine Instructor (MEI)",
  "Ground Instructor",
  "Remote Pilot (Part 107)",
];

export const RATING_SUGGESTIONS = [
  "Instrument — Airplane",
  "Airplane Single-Engine Land",
  "Airplane Multi-Engine Land",
  "Airplane Single-Engine Sea",
  "Rotorcraft — Helicopter",
  "Glider",
  "Type rating",
];

export const ENDORSEMENT_SUGGESTIONS = [
  "Flight review (61.56)",
  "Pilot proficiency check (61.58)",
  "WINGS phase completion (61.56(e))",
  "Instrument proficiency check (61.57(d))",
  "Complex airplane (61.31(e))",
  "High-performance airplane (61.31(f))",
  "High-altitude / pressurized (61.31(g))",
  "Tailwheel (61.31(i))",
  "Solo flight (61.87)",
  "Solo cross-country (61.93)",
  "90-day solo renewal (61.87(p))",
];

// Theme and accent options live in ./theme so client components can use them.

export interface Flight {
  id: number;
  user_id: number;
  date: string;
  aircraft_type: string;
  tail_number: string;
  from_airport: string;
  to_airport: string;
  route: string;
  total_time: number;
  pic: number;
  sic: number;
  dual_received: number;
  solo: number;
  night: number;
  cross_country: number;
  actual_instrument: number;
  simulated_instrument: number;
  day_landings: number;
  night_landings: number;
  night_full_stop_landings: number;
  approaches: number;
  holds: number;
  remarks: string;
  created_at: string;
}

export interface Aircraft {
  id: number;
  user_id: number;
  tail_number: string;
  aircraft_type: string;
  make_model: string;
  category_class: string;
  is_complex: number;
  is_high_performance: number;
  is_taa: number;
  is_tailwheel: number;
  notes: string;
  created_at: string;
}

// Aircraft constants live in ./aircraft so client components can use them.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  medical_expiry TEXT,
  flight_review_date TEXT,
  theme TEXT NOT NULL DEFAULT 'system',
  accent TEXT NOT NULL DEFAULT 'blue',
  accent_custom TEXT,
  date_of_birth TEXT,
  avatar BLOB,
  avatar_type TEXT,
  avatar_version TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS flights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  aircraft_type TEXT NOT NULL DEFAULT '',
  tail_number TEXT NOT NULL DEFAULT '',
  from_airport TEXT NOT NULL DEFAULT '',
  to_airport TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  total_time REAL NOT NULL DEFAULT 0,
  pic REAL NOT NULL DEFAULT 0,
  sic REAL NOT NULL DEFAULT 0,
  dual_received REAL NOT NULL DEFAULT 0,
  solo REAL NOT NULL DEFAULT 0,
  night REAL NOT NULL DEFAULT 0,
  cross_country REAL NOT NULL DEFAULT 0,
  actual_instrument REAL NOT NULL DEFAULT 0,
  simulated_instrument REAL NOT NULL DEFAULT 0,
  day_landings INTEGER NOT NULL DEFAULT 0,
  night_landings INTEGER NOT NULL DEFAULT 0,
  night_full_stop_landings INTEGER NOT NULL DEFAULT 0,
  approaches INTEGER NOT NULL DEFAULT 0,
  remarks TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_flights_user_date ON flights(user_id, date);
CREATE TABLE IF NOT EXISTS aircraft (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tail_number TEXT NOT NULL,
  aircraft_type TEXT NOT NULL DEFAULT '',
  make_model TEXT NOT NULL DEFAULT '',
  category_class TEXT NOT NULL DEFAULT 'ASEL',
  is_complex INTEGER NOT NULL DEFAULT 0,
  is_high_performance INTEGER NOT NULL DEFAULT 0,
  is_taa INTEGER NOT NULL DEFAULT 0,
  is_tailwheel INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, tail_number)
);
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'certificate',
  name TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  issued_date TEXT NOT NULL DEFAULT '',
  expires_date TEXT NOT NULL DEFAULT '',
  resets_flight_review INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS medicals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medical_class TEXT NOT NULL DEFAULT 'Unspecified',
  exam_date TEXT NOT NULL DEFAULT '',
  expires_date TEXT NOT NULL DEFAULT '',
  examiner TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS endorsements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endorsement_type TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  expires_date TEXT NOT NULL DEFAULT '',
  instructor_name TEXT NOT NULL DEFAULT '',
  instructor_cert TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  citation TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, source, citation)
);
CREATE TABLE IF NOT EXISTS bookmark_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);
-- Many-to-many on purpose: one regulation belongs in as many groups as it's
-- relevant to. The composite primary key makes a repeat insert a no-op rather
-- than a duplicate row. Both sides already carry user_id, so the join can't
-- cross accounts even if a stale id were passed in.
CREATE TABLE IF NOT EXISTS bookmark_group_members (
  group_id INTEGER NOT NULL REFERENCES bookmark_groups(id) ON DELETE CASCADE,
  bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, bookmark_id)
);
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
// The username unique index is created in migrate(), after the column is
// guaranteed to exist on databases that predate it.

/** Trim a candidate to the allowed username shape; empty means unusable. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 20);
}

/**
 * How much of each kind of record a pilot owns — shown before an erasure.
 * Returns [count, singular, plural] so the summary reads naturally.
 */
/** Profile picture bytes for a user, or null when none is set. */
export function avatarForUser(userId: number): { data: Buffer; type: string } | null {
  const row = getDb()
    .prepare("SELECT avatar, avatar_type FROM users WHERE id = ?")
    .get(userId) as { avatar: Buffer | null; avatar_type: string | null } | undefined;
  if (!row?.avatar || !row.avatar_type) return null;
  return { data: row.avatar, type: row.avatar_type };
}

export function dataCountsForUser(userId: number): [number, string, string][] {
  const db = getDb();
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE user_id = ?`).get(userId) as { c: number }).c;
  return [
    [count("flights"), "flight", "flights"],
    [count("aircraft"), "aircraft", "aircraft"],
    [count("certificates"), "certificate or rating", "certificates and ratings"],
    [count("medicals"), "medical", "medicals"],
    [count("endorsements"), "endorsement", "endorsements"],
  ];
}

/** Look up the owner of a name, case-insensitively, optionally excluding one id. */
export function userIdWithName(name: string, exceptId?: number): number | null {
  const row = getDb()
    .prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE")
    .get(name) as { id: number } | undefined;
  if (!row || row.id === exceptId) return null;
  return row.id;
}

/** Additive migrations for databases created before a column existed. */
function migrate(db: Database.Database) {
  const cols = (db.prepare("PRAGMA table_info(flights)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("holds")) {
    db.exec("ALTER TABLE flights ADD COLUMN holds INTEGER NOT NULL DEFAULT 0");
  }
  const acCols = (db.prepare("PRAGMA table_info(aircraft)").all() as { name: string }[]).map((c) => c.name);
  for (const col of ["is_complex", "is_high_performance", "is_taa", "is_tailwheel"]) {
    if (!acCols.includes(col)) {
      db.exec(`ALTER TABLE aircraft ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
    }
  }
  const certCols = (db.prepare("PRAGMA table_info(certificates)").all() as { name: string }[]).map((c) => c.name);
  if (!certCols.includes("resets_flight_review")) {
    db.exec("ALTER TABLE certificates ADD COLUMN resets_flight_review INTEGER NOT NULL DEFAULT 1");
  }
  const userCols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  if (!userCols.includes("theme")) {
    db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'");
  }
  if (!userCols.includes("accent")) {
    db.exec("ALTER TABLE users ADD COLUMN accent TEXT NOT NULL DEFAULT 'blue'");
  }
  if (!userCols.includes("date_of_birth")) {
    db.exec("ALTER TABLE users ADD COLUMN date_of_birth TEXT");
  }
  if (!userCols.includes("accent_custom")) {
    db.exec("ALTER TABLE users ADD COLUMN accent_custom TEXT");
  }
  if (!userCols.includes("avatar")) {
    db.exec("ALTER TABLE users ADD COLUMN avatar BLOB");
    db.exec("ALTER TABLE users ADD COLUMN avatar_type TEXT");
  }
  if (!userCols.includes("avatar_version")) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_version TEXT");
  }
  if (!userCols.includes("username")) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT");
  }

  // Give pre-existing accounts a username derived from their email, so they can
  // sign in either way. Done before the unique index exists, so dedupe here.
  const needsUsername = db
    .prepare("SELECT id, email FROM users WHERE username IS NULL OR username = ''")
    .all() as { id: number; email: string }[];
  if (needsUsername.length > 0) {
    const taken = new Set(
      (db.prepare("SELECT username FROM users WHERE username IS NOT NULL").all() as { username: string }[])
        .map((r) => r.username.toLowerCase())
    );
    const setUsername = db.prepare("UPDATE users SET username = ? WHERE id = ?");
    db.transaction(() => {
      for (const u of needsUsername) {
        const base = normalizeUsername(u.email.split("@")[0]).padEnd(3, "0") || `pilot${u.id}`;
        let candidate = base;
        let n = 1;
        while (taken.has(candidate.toLowerCase())) candidate = `${base}${++n}`;
        taken.add(candidate.toLowerCase());
        setUsername.run(candidate, u.id);
      }
    })();
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE)");

  // Display name and username became one field. Prefer the friendlier display
  // name where it's a valid, unclaimed choice; otherwise keep the username.
  if (!db.prepare("SELECT value FROM schema_meta WHERE key = 'name_merged'").get()) {
    db.transaction(() => {
      const users = db.prepare("SELECT id, name, username FROM users").all() as {
        id: number;
        name: string;
        username: string;
      }[];
      const taken = new Set(users.map((u) => u.username.toLowerCase()));
      const update = db.prepare("UPDATE users SET username = ?, name = ? WHERE id = ?");
      for (const u of users) {
        const wanted = (u.name ?? "").trim();
        const free = !taken.has(wanted.toLowerCase()) || wanted.toLowerCase() === u.username.toLowerCase();
        const chosen = wanted && free && nameError(wanted) === null ? wanted : u.username;
        taken.delete(u.username.toLowerCase());
        taken.add(chosen.toLowerCase());
        update.run(chosen, chosen, u.id);
      }
      db.prepare("INSERT INTO schema_meta (key, value) VALUES ('name_merged', datetime('now'))").run();
    })();
  }

  // One-time move of the legacy Settings dates into profile records. Guarded by
  // schema_meta so deleting a seeded record doesn't resurrect it.
  const done = db.prepare("SELECT value FROM schema_meta WHERE key = 'profile_seeded'").get();
  if (!done) {
    const seed = db.transaction(() => {
      const users = db
        .prepare("SELECT id, medical_expiry, flight_review_date FROM users")
        .all() as { id: number; medical_expiry: string | null; flight_review_date: string | null }[];
      for (const u of users) {
        if (u.medical_expiry) {
          db.prepare(
            "INSERT INTO medicals (user_id, medical_class, expires_date, notes) VALUES (?, 'Unspecified', ?, ?)"
          ).run(u.id, u.medical_expiry, "Imported from Settings");
        }
        if (u.flight_review_date) {
          db.prepare(
            "INSERT INTO endorsements (user_id, endorsement_type, date, notes) VALUES (?, ?, ?, ?)"
          ).run(u.id, "Flight review (61.56)", u.flight_review_date, "Imported from Settings");
        }
      }
      db.prepare("INSERT INTO schema_meta (key, value) VALUES ('profile_seeded', datetime('now'))").run();
    });
    seed();
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __logbookDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (!global.__logbookDb) {
    const dataDir = path.join(process.cwd(), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    const db = new Database(path.join(dataDir, "logbook.db"));
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    migrate(db);
    global.__logbookDb = db;
  }
  return global.__logbookDb;
}

export function flightsForUser(userId: number): Flight[] {
  return getDb()
    .prepare("SELECT * FROM flights WHERE user_id = ? ORDER BY date DESC, id DESC")
    .all(userId) as Flight[];
}

export function flightById(userId: number, id: number): Flight | undefined {
  return getDb()
    .prepare("SELECT * FROM flights WHERE user_id = ? AND id = ?")
    .get(userId, id) as Flight | undefined;
}

export function aircraftForUser(userId: number): Aircraft[] {
  return getDb()
    .prepare("SELECT * FROM aircraft WHERE user_id = ? ORDER BY tail_number")
    .all(userId) as Aircraft[];
}

/** Map of uppercase tail number -> aircraft profile for currency grouping. */
export function aircraftByTail(userId: number): Map<string, Aircraft> {
  const map = new Map<string, Aircraft>();
  for (const a of aircraftForUser(userId)) {
    map.set(a.tail_number.toUpperCase(), a);
  }
  return map;
}

export function certificatesForUser(userId: number): Certificate[] {
  return getDb()
    .prepare("SELECT * FROM certificates WHERE user_id = ? ORDER BY kind, issued_date DESC, id DESC")
    .all(userId) as Certificate[];
}

/** Newest first. Records carrying an exam date outrank legacy expiry-only rows. */
export function medicalsForUser(userId: number): Medical[] {
  return getDb()
    .prepare("SELECT * FROM medicals WHERE user_id = ? ORDER BY exam_date DESC, expires_date DESC, id DESC")
    .all(userId) as Medical[];
}

export function endorsementsForUser(userId: number): Endorsement[] {
  return getDb()
    .prepare("SELECT * FROM endorsements WHERE user_id = ? ORDER BY date DESC, id DESC")
    .all(userId) as Endorsement[];
}

// ---------- Bookmarks ----------

/**
 * A saved regulation or AIM paragraph.
 *
 * Only the citation is stored, never the text: the wording lives in
 * `reference.db` and is replaced wholesale each time the datasets are rebuilt.
 * A bookmark carrying its own copy would quietly go stale against the
 * regulation it points at, which is the one thing a reference tool must not do.
 */
export interface Bookmark {
  id: number;
  user_id: number;
  source: string;
  citation: string;
  name: string;
  created_at: string;
}

/** A named collection. Membership is many-to-many — see the schema. */
export interface BookmarkGroup {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
}

export function bookmarksForUser(userId: number): Bookmark[] {
  return getDb()
    .prepare("SELECT * FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC, id DESC")
    .all(userId) as Bookmark[];
}

export function bookmarkGroupsForUser(userId: number): BookmarkGroup[] {
  return getDb()
    .prepare("SELECT * FROM bookmark_groups WHERE user_id = ? ORDER BY name COLLATE NOCASE")
    .all(userId) as BookmarkGroup[];
}

/** Bookmark id → the groups it sits in. */
export function bookmarkMembershipForUser(userId: number): Map<number, Set<number>> {
  const rows = getDb()
    .prepare(
      `SELECT m.bookmark_id AS bookmarkId, m.group_id AS groupId
         FROM bookmark_group_members m
         JOIN bookmarks b ON b.id = m.bookmark_id
        WHERE b.user_id = ?`
    )
    .all(userId) as { bookmarkId: number; groupId: number }[];
  const out = new Map<number, Set<number>>();
  for (const r of rows) {
    const set = out.get(r.bookmarkId) ?? new Set<number>();
    set.add(r.groupId);
    out.set(r.bookmarkId, set);
  }
  return out;
}

/** What most recently restarted the 61.56 clock, and when. */
export interface ReviewReset {
  date: string;
  label: string;
}

export interface Credentials {
  medical: Medical | null;
  dateOfBirth: string | null;
  flightReview: ReviewReset | null;
}

/**
 * Whether an endorsement restarts the 61.56 clock. A flight review does, as
 * does a 61.58 pilot proficiency check or a WINGS phase (61.56(e)). An
 * *instrument* proficiency check does not — 61.57(d) restores instrument
 * currency, and an IPC is not a check "for a certificate, rating, or operating
 * privilege," so it is excluded even though its name contains "proficiency
 * check".
 */
export function endorsementResetsReview(type: string): boolean {
  const t = type.toLowerCase();
  if (t.includes("instrument proficiency") || /^ipc\b/.test(t)) return false;
  return t.startsWith("flight review") || t.includes("proficiency check") || t.includes("wings");
}

/**
 * The most recent event that restarts the 61.56 clock, or null. Pure so the
 * rules can be tested without a database.
 */
export function pickReviewReset(
  endorsements: Pick<Endorsement, "endorsement_type" | "date">[],
  certificates: Pick<Certificate, "name" | "issued_date" | "resets_flight_review">[]
): ReviewReset | null {
  const resets: ReviewReset[] = [];
  for (const e of endorsements) {
    if (e.date && endorsementResetsReview(e.endorsement_type)) {
      resets.push({ date: e.date, label: e.endorsement_type });
    }
  }
  for (const c of certificates) {
    if (c.issued_date && c.resets_flight_review) {
      resets.push({ date: c.issued_date, label: `${c.name} practical test` });
    }
  }
  resets.sort((a, b) => (a.date < b.date ? 1 : -1));
  return resets[0] ?? null;
}

/**
 * The medical expiration and the most recent flight-review reset. Under
 * 61.56(d) passing a practical test for a certificate, rating, or operating
 * privilege substitutes for the review, so certificates and ratings marked as
 * earned by practical test count alongside flight review endorsements; the
 * newest of them wins.
 */
export function credentialsForUser(user: User): Credentials {
  return {
    medical: medicalsForUser(user.id)[0] ?? null,
    dateOfBirth: user.date_of_birth ?? null,
    flightReview: pickReviewReset(endorsementsForUser(user.id), certificatesForUser(user.id)),
  };
}

// ---------- Backup ----------

/**
 * Everything one pilot owns, as a value.
 *
 * Scoped to a single user_id throughout: the database holds many accounts and a
 * backup must never carry somebody else's logbook. Row ids and user_id are
 * stripped, since neither means anything in the database it's restored into.
 */
export function archiveForUser(userId: number, now = new Date()): BackupArchive {
  const db = getDb();
  const strip = (rows: Record<string, unknown>[]) =>
    rows.map((r) => {
      const { id, user_id, created_at, ...rest } = r;
      void id;
      void user_id;
      void created_at;
      return rest;
    });

  const user = db.prepare("SELECT name, date_of_birth FROM users WHERE id = ?").get(userId) as
    | { name: string; date_of_birth: string | null }
    | undefined;

  const marks = bookmarksForUser(userId);
  const groups = bookmarkGroupsForUser(userId);
  const membership = bookmarkMembershipForUser(userId);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  return {
    formatVersion: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    pilot: { name: user?.name ?? "", dateOfBirth: user?.date_of_birth ?? null },
    flights: strip(flightsForUser(userId) as unknown as Record<string, unknown>[]),
    aircraft: strip(aircraftForUser(userId) as unknown as Record<string, unknown>[]),
    certificates: strip(certificatesForUser(userId) as unknown as Record<string, unknown>[]),
    medicals: strip(medicalsForUser(userId) as unknown as Record<string, unknown>[]),
    endorsements: strip(endorsementsForUser(userId) as unknown as Record<string, unknown>[]),
    bookmarkGroups: groups.map((g) => g.name),
    bookmarks: marks.map((m) => ({
      source: m.source,
      citation: m.citation,
      name: m.name,
      groups: [...(membership.get(m.id) ?? [])]
        .map((id) => groupName.get(id))
        .filter((n): n is string => !!n),
    })),
  };
}

// ---------- Restore ----------

const FLIGHT_COLS = [
  "date", "aircraft_type", "tail_number", "from_airport", "to_airport", "route",
  "total_time", "pic", "sic", "dual_received", "solo", "night", "cross_country",
  "actual_instrument", "simulated_instrument", "day_landings", "night_landings",
  "night_full_stop_landings", "approaches", "holds", "remarks",
];
const AIRCRAFT_COLS = [
  "tail_number", "aircraft_type", "make_model", "category_class",
  "is_complex", "is_high_performance", "is_taa", "is_tailwheel", "notes",
];
const CERT_COLS = ["kind", "name", "number", "issued_date", "expires_date", "resets_flight_review", "notes"];
const MEDICAL_COLS = ["medical_class", "exam_date", "expires_date", "examiner", "notes"];
const ENDORSEMENT_COLS = ["endorsement_type", "date", "expires_date", "instructor_name", "instructor_cert", "notes"];

/** Coerce a loose JSON value into what the column expects. */
function cell(v: unknown, numeric: boolean): string | number {
  if (numeric) {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : 0;
  }
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

const NUMERIC = new Set([
  "total_time", "pic", "sic", "dual_received", "solo", "night", "cross_country",
  "actual_instrument", "simulated_instrument", "day_landings", "night_landings",
  "night_full_stop_landings", "approaches", "holds",
  "is_complex", "is_high_performance", "is_taa", "is_tailwheel", "resets_flight_review",
]);

/**
 * Writes an archive over the signed-in pilot's rows.
 *
 * A restore replaces rather than merges. Merging would mean deciding what
 * counts as the same flight, and being wrong either way is worse: restoring the
 * same file twice would silently double a logbook, and a pilot who restores is
 * usually recovering, not combining. One transaction, so a failure part-way
 * leaves the logbook as it was rather than half-overwritten.
 */
export function writeArchive(userId: number, archive: BackupArchive) {
  const db = getDb();
  const insertInto = (table: string, cols: string[], rows: Record<string, unknown>[]) => {
    const stmt = db.prepare(
      `INSERT INTO ${table} (user_id, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`
    );
    for (const row of rows) stmt.run(userId, ...cols.map((c) => cell(row[c], NUMERIC.has(c))));
  };

  db.transaction(() => {
    for (const t of ["flights", "aircraft", "certificates", "medicals", "endorsements", "bookmarks", "bookmark_groups"]) {
      db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId);
    }
    insertInto("flights", FLIGHT_COLS, archive.flights);
    insertInto("aircraft", AIRCRAFT_COLS, archive.aircraft);
    insertInto("certificates", CERT_COLS, archive.certificates);
    insertInto("medicals", MEDICAL_COLS, archive.medicals);
    insertInto("endorsements", ENDORSEMENT_COLS, archive.endorsements);

    // Groups first, so the bookmarks below have something to join to.
    const groupId = new Map<string, number>();
    const addGroup = (raw: string) => {
      const name = raw.trim();
      const key = name.toLowerCase();
      if (!name || groupId.has(key)) return;
      const info = db
        .prepare("INSERT OR IGNORE INTO bookmark_groups (user_id, name) VALUES (?, ?)")
        .run(userId, name);
      groupId.set(key, Number(info.lastInsertRowid));
    };
    for (const g of archive.bookmarkGroups) addGroup(g);

    for (const mark of archive.bookmarks) {
      if (!mark.source || !mark.citation) continue;
      const info = db
        .prepare("INSERT OR IGNORE INTO bookmarks (user_id, source, citation, name) VALUES (?, ?, ?, ?)")
        .run(userId, mark.source, mark.citation, mark.name);
      const bookmarkId = Number(info.lastInsertRowid);
      for (const g of mark.groups) {
        // A group named only on a bookmark, never in the group list, still gets
        // made — better than dropping the membership.
        addGroup(g);
        const gid = groupId.get(g.trim().toLowerCase());
        if (!gid) continue;
        db.prepare(
          "INSERT OR IGNORE INTO bookmark_group_members (group_id, bookmark_id) VALUES (?, ?)"
        ).run(gid, bookmarkId);
      }
    }

    db.prepare("UPDATE users SET date_of_birth = ? WHERE id = ?").run(
      archive.pilot.dateOfBirth,
      userId
    );
  })();
}


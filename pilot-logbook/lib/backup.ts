/**
 * A whole logbook in one file.
 *
 * The CSV export carries flights and nothing else, which is fine for moving
 * hours between apps and useless as a backup: aircraft profiles, certificates,
 * medicals, and endorsements are what drive currency, the 61.23(d) medical
 * ladder, and the flight-review reset, and none of them could leave the server
 * by any route at all.
 *
 * JSON rather than a copy of the SQLite file, because a backup you can open and
 * read is a backup you can trust — and one that survives a schema change rather
 * than depending on it. It is also per-pilot: the database holds many accounts,
 * and a backup must never carry somebody else's logbook.
 *
 * Ported from the iOS app's `Logic/Backup.swift`; the two formats are the same
 * shape, so a backup taken on one imports into the other.
 */

/** Bumped when the shape changes in a way an older build couldn't read. */
export const BACKUP_VERSION = 1;

export interface BackupBookmark {
  source: string;
  citation: string;
  name: string;
  /** Group names, not row ids — ids are meaningless in another database. */
  groups: string[];
}

export interface BackupArchive {
  formatVersion: number;
  exportedAt: string;
  pilot: { name: string; dateOfBirth: string | null };
  flights: Record<string, unknown>[];
  aircraft: Record<string, unknown>[];
  certificates: Record<string, unknown>[];
  medicals: Record<string, unknown>[];
  endorsements: Record<string, unknown>[];
  bookmarkGroups: string[];
  bookmarks: BackupBookmark[];
}

export class BackupError extends Error {}

export function recordCount(a: BackupArchive): number {
  return (
    a.flights.length +
    a.aircraft.length +
    a.certificates.length +
    a.medicals.length +
    a.endorsements.length +
    a.bookmarks.length
  );
}

export function encodeBackup(archive: BackupArchive): string {
  // Readable and diffable — the point of choosing JSON.
  return JSON.stringify(archive, null, 2);
}

/**
 * Parses a backup, refusing anything that isn't one.
 *
 * A file from a *newer* version is refused rather than half-read: silently
 * dropping fields it doesn't understand would restore an incomplete logbook and
 * say it succeeded.
 */
export function decodeBackup(text: string): BackupArchive {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't a Pilot Logbook backup — it isn't even JSON.");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new BackupError("That file isn't a Pilot Logbook backup.");
  }
  const o = raw as Record<string, unknown>;
  const version = typeof o.formatVersion === "number" ? o.formatVersion : 0;
  if (version === 0 || !Array.isArray(o.flights)) {
    throw new BackupError("That file isn't a Pilot Logbook backup.");
  }
  if (version > BACKUP_VERSION) {
    throw new BackupError(
      `That backup was written by a newer version (format ${version}; this build reads ` +
        `${BACKUP_VERSION}). Update the app and try again.`
    );
  }

  const rows = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v.filter((x) => typeof x === "object" && x !== null) as Record<string, unknown>[]) : [];

  const pilot = (o.pilot ?? {}) as Record<string, unknown>;
  return {
    formatVersion: version,
    exportedAt: typeof o.exportedAt === "string" ? o.exportedAt : "",
    pilot: {
      name: typeof pilot.name === "string" ? pilot.name : "",
      dateOfBirth:
        typeof pilot.dateOfBirth === "string" && pilot.dateOfBirth ? pilot.dateOfBirth : null,
    },
    flights: rows(o.flights),
    aircraft: rows(o.aircraft),
    certificates: rows(o.certificates),
    medicals: rows(o.medicals),
    endorsements: rows(o.endorsements),
    bookmarkGroups: Array.isArray(o.bookmarkGroups)
      ? o.bookmarkGroups.filter((g): g is string => typeof g === "string")
      : [],
    bookmarks: rows(o.bookmarks).map((b) => ({
      source: String(b.source ?? ""),
      citation: String(b.citation ?? ""),
      name: String(b.name ?? ""),
      groups: Array.isArray(b.groups)
        ? (b.groups as unknown[]).filter((g): g is string => typeof g === "string")
        : [],
    })),
  };
}

/** A filename that sorts by date and says what it is. */
export function backupFilename(day = new Date()): string {
  const iso = day.toISOString().slice(0, 10);
  return `pilot-logbook-backup-${iso}.json`;
}

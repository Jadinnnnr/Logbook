import { requireUser } from "@/lib/auth";
import { flightsForUser } from "@/lib/db";
import { importCsv, restoreBackup } from "@/lib/actions";

export default async function ImportExportPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    imported?: string;
    skipped?: string;
    restored?: string;
    restoreError?: string;
  }>;
}) {
  const user = await requireUser();
  const { error, imported, skipped, restored, restoreError } = await searchParams;
  const count = flightsForUser(user.id).length;
  return (
    <main className="container">
      <h1>Import / Export</h1>
      {error && <div className="error">{error}</div>}
      {imported && (
        <div className="notice">
          Imported {imported} flights{skipped ? ` (${skipped} rows skipped)` : ""}.
        </div>
      )}
      {restoreError && <div className="error">{restoreError}</div>}
      {restored && <div className="notice">Restored {restored} records from the backup.</div>}

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Backup</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          A backup holds <strong>everything</strong>: flights, aircraft, certificates, medicals,
          endorsements, bookmarks and their groups, and your date of birth. The CSV below carries
          flights and nothing else, so it is not a backup. The file is plain JSON, so you can open
          and read it.
        </p>
        <p style={{ margin: "0 0 12px" }}>
          <a href="/api/backup" className="btn">Download a backup</a>
        </p>
        <form action={restoreBackup} className="stack">
          <label htmlFor="backup-file">Restore from a backup</label>
          <input id="backup-file" type="file" name="file" accept=".json,application/json" required />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Restoring <strong>replaces</strong> your whole logbook rather than merging into it, so
            restoring the same file twice can&rsquo;t double anything. It cannot be undone.
          </p>
          <button type="submit" className="danger">Replace logbook with this backup</button>
        </form>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Import CSV</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Upload a CSV with a header row. Recognized columns include Date, Aircraft Type,
          Tail Number, From, To, Total Time, PIC, Night, Day/Night Landings, Remarks and
          common ForeFlight export names. Rows without a valid date are skipped.
        </p>
        <form action={importCsv} className="stack">
          <input type="file" name="file" accept=".csv,text/csv" required />
          <div>
            <button type="submit">Import Flights</button>
          </div>
        </form>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <h2>Export CSV</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Download all {count} of your flights as a CSV backup. The file re-imports cleanly here.
        </p>
        <a href="/api/export" className="btn">Download logbook.csv</a>
      </div>
    </main>
  );
}

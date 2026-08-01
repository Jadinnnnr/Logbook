import { requireUser } from "@/lib/auth";
import { flightsForUser } from "@/lib/db";
import { importCsv } from "@/lib/actions";

export default async function ImportExportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; imported?: string; skipped?: string }>;
}) {
  const user = await requireUser();
  const { error, imported, skipped } = await searchParams;
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

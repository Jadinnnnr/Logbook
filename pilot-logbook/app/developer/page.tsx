import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { devAccounts } from "@/lib/devaccounts";
import { loadDevAccount } from "@/lib/actions";

/**
 * Loads a canned account over the signed-in pilot's logbook, for exercising
 * screens against data that isn't yours.
 *
 * The password keeps the page out of the way of someone handed the laptop; it
 * is not a security boundary, and the note at the foot says so.
 */
export default async function DeveloperPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; loaded?: string }>;
}) {
  await requireUser();
  const { error, loaded } = await searchParams;
  const accounts = devAccounts();

  return (
    <main className="container">
      <p className="crumb">
        <Link href="/settings">← Settings</Link>
      </p>
      <h1>Developer</h1>

      {error && <p className="error-banner">{error}</p>}
      {loaded && <p className="ok-banner">Loaded “{loaded}”.</p>}

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Loading an account <strong>replaces every flight, aircraft, certificate, medical, and
          endorsement</strong> in your logbook. It cannot be undone — take a backup first from{" "}
          <Link href="/import-export">Import &amp; Export</Link>.
        </p>

        {accounts.map((a) => (
          <form action={loadDevAccount} key={a.name} className="dev-account">
            <div>
              <div style={{ fontWeight: 600 }}>{a.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>{a.summary}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {a.flights.length === 0 && a.aircraft.length === 0
                  ? "No records"
                  : [
                      a.flights.length ? `${a.flights.length} flights` : null,
                      a.aircraft.length ? `${a.aircraft.length} aircraft` : null,
                      a.certificates.length + a.medicals.length + a.endorsements.length
                        ? `${a.certificates.length + a.medicals.length + a.endorsements.length} profile records`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </div>
            </div>
            <input type="hidden" name="account" value={a.name} />
            <input
              type="password"
              name="password"
              placeholder="Password"
              aria-label={`Developer password to load ${a.name}`}
              style={{ maxWidth: 170 }}
            />
            <button type="submit" className="danger">Replace logbook</button>
          </form>
        ))}
      </div>

      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          These are generated fixtures, not real pilots or real flights. The password on this page
          is stored in the source and is not a security boundary — it stops the page being opened
          by accident, nothing more. Don&rsquo;t put a real logbook on a deployment where that
          matters.
        </p>
      </div>
    </main>
  );
}

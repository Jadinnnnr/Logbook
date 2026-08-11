import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { allToldProfiles } from "@/lib/db";
import TOLDCalculator from "@/components/TOLDCalculator";

/**
 * Takeoff and Landing Data — the FIT Aviation weight-and-balance card.
 *
 * Takeoff and landing *distances* stay on the Performance page rather than
 * being duplicated here; the link at the foot carries you across.
 */
export default async function TOLDPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { profile, error } = await searchParams;
  const profiles = allToldProfiles(user.id);

  return (
    <main className="container">
      <p className="crumb">
        <Link href="/resources">← Resources</Link>
      </p>
      <h1>TOLD</h1>
      {error && <div className="error">{error}</div>}

      <TOLDCalculator profiles={profiles} initialProfileId={profile} />

      <div className="card" style={{ maxWidth: 620 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Density altitude, wind components, and the PA-28-181 POH distances are on the{" "}
          <Link href="/resources/performance">Performance</Link> page — take the takeoff weight
          above across to it.
        </p>
      </div>
    </main>
  );
}

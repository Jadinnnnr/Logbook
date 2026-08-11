import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { referenceAvailable, referenceCounts } from "@/lib/reference";
import { airportDataAvailable, airportCount } from "@/lib/airportinfo";
import DataFreshness from "@/components/DataFreshness";
import { datasetStatuses, refreshStatus, refreshRunning } from "@/lib/datastatus";

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ refresh?: string }>;
}) {
  await requireUser();
  const { refresh } = await searchParams;

  const counts = referenceCounts();
  const haveRefs = referenceAvailable();
  const haveAirports = airportDataAvailable();

  const links = [
    {
      href: "/resources/airports",
      title: "Airport Lookup",
      blurb: haveAirports
        ? `${airportCount().toLocaleString()} airports in the contiguous US — runways, frequencies, services, the FAA diagram, published approaches, and live METAR/TAF.`
        : "Runways, frequencies, services, diagrams, approaches, and live weather. Build the airport database below to enable it.",
    },
    {
      href: "/resources/told",
      title: "TOLD",
      blurb:
        "Weight and balance for the FIT fleet — Archer, Warrior, Seminole and Citabria — with ramp, takeoff and landing weights, their centres of gravity, and the loading envelope. Add your own aircraft from its POH.",
    },
    {
      href: "/resources/performance",
      title: "Performance",
      blurb:
        "Pressure and density altitude, ISA deviation, and head/crosswind components — prefilled from an airport's elevation and current METAR. Apply your POH numbers to get takeoff and landing distances.",
    },
    {
      href: "/resources/regulations",
      title: "FAR / AIM Search",
      blurb: haveRefs
        ? `Full-text search across ${counts.far.toLocaleString()} FAR sections and ${counts.aim.toLocaleString()} AIM paragraphs, with the complete text of each.`
        : "Full-text search of the FARs and the AIM. Build the reference database below to enable it.",
    },
  ];

  return (
    <main className="container">
      <h1>Resources</h1>
      <p className="muted" style={{ marginTop: -12 }}>
        Flight planning and reference material.
      </p>

      <div className="res-links">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="res-link">
            <span className="res-link-title">{l.title}</span>
            <span className="res-link-blurb">{l.blurb}</span>
            <span className="res-link-go" aria-hidden>
              Open →
            </span>
          </Link>
        ))}
      </div>

      <DataFreshness
        datasets={datasetStatuses()}
        status={refreshStatus()}
        running={refreshRunning()}
        notice={
          refresh === "started"
            ? "Refresh started. It runs in the background — reload this page to follow progress."
            : refresh === "already"
              ? "A refresh is already running."
              : undefined
        }
      />

      <p className="muted" style={{ fontSize: 12, maxWidth: 760 }}>
        Airport and regulatory data are local copies of US government works, only as current as the
        last refresh; weather is fetched live. Check the official source before relying on any of
        it, and get a proper preflight briefing.
      </p>
    </main>
  );
}

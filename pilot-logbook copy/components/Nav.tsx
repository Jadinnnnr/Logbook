import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { logout } from "@/lib/actions";

export default async function Nav() {
  const user = await getSessionUser();
  // Signed-out pages carry their own branding in AuthLayout.
  if (!user) return null;
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="nav-brand">✈ Pilot Logbook</Link>
        <Link href="/" className="nav-link">Dashboard</Link>
        <Link href="/flights" className="nav-link">Flights</Link>
        <Link href="/aircraft" className="nav-link">Aircraft</Link>
        <Link href="/stats" className="nav-link">Stats</Link>
        <Link href="/proficiency" className="nav-link">Proficiency</Link>
        <Link href="/import-export" className="nav-link">Import / Export</Link>
        <Link href="/resources" className="nav-link">Resources</Link>
        <Link href="/settings" className="nav-link">Settings</Link>
        <span className="nav-spacer" />
        <Link href="/profile" className="nav-user" title="Your profile — certificates, medicals, endorsements">
          {user.avatar_type ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`/api/avatar?v=${user.avatar_version ?? ""}`} alt="" className="avatar avatar-sm" />
          ) : (
            <span className="avatar avatar-sm avatar-initials" aria-hidden>
              {user.username.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
            </span>
          )}
          {user.username}
        </Link>
        <form action={logout}>
          <button className="btn-secondary" style={{ padding: "5px 12px", fontSize: 13 }}>
            Log Out
          </button>
        </form>
      </div>
    </nav>
  );
}

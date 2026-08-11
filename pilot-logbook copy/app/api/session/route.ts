import { destroySession, keepSessionAlive, sessionDeadline } from "@/lib/auth";

/**
 * Backs the idle-timeout dialog.
 *
 *   GET    — when the session lapses, *without* counting as activity. Polling
 *            this must not keep a session alive, or the timeout never fires.
 *   POST   — "Stay signed in": restarts the idle clock.
 *   DELETE — the countdown ran out; drop the session and clear the cookie.
 *
 * Every response carries the absolute deadline rather than a duration, so a
 * slow round trip can't hand the browser a clock that runs late.
 */
export const dynamic = "force-dynamic";

function deadlineResponse(expiresAt: number | null) {
  if (expiresAt === null) return Response.json({ signedIn: false }, { status: 401 });
  return Response.json({ signedIn: true, expiresAt });
}

export async function GET() {
  return deadlineResponse(await sessionDeadline());
}

export async function POST() {
  return deadlineResponse(await keepSessionAlive());
}

export async function DELETE() {
  await destroySession();
  return Response.json({ signedIn: false });
}

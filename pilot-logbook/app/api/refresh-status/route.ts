import { getSessionUser } from "@/lib/auth";
import { refreshStatus, refreshRunning } from "@/lib/datastatus";

/**
 * Polled by the progress bar while a refresh is in flight.
 *
 * Deliberately tiny and uncached: the whole point is to reflect a file that is
 * being rewritten every few seconds.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  return Response.json(
    { status: refreshStatus(), running: refreshRunning() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

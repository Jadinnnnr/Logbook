import { getSessionUser } from "@/lib/auth";
import { lookupTailNumber } from "@/lib/registry";

/** Tail-number lookup for the aircraft form's autofill. Signed-in users only. */
export async function GET(request: Request) {
  if (!(await getSessionUser())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const tail = new URL(request.url).searchParams.get("tail") ?? "";
  const match = lookupTailNumber(tail);
  return Response.json(match ? { found: true, aircraft: match } : { found: false });
}

import { createHash } from "crypto";
import { getSessionUser } from "@/lib/auth";
import { avatarForUser } from "@/lib/db";

/**
 * Serves the signed-in pilot's own profile picture. Deliberately scoped to the
 * session rather than taking a user id, so one pilot can't enumerate another's.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const avatar = avatarForUser(user.id);
  if (!avatar) return new Response("No profile picture", { status: 404 });

  // The URL never changes, so without a validator the browser keeps showing the
  // old picture after an upload. Tag it with the bytes themselves: revalidation
  // is one cheap round trip and a re-upload always wins.
  const etag = `"${createHash("sha1").update(avatar.data).digest("base64url")}"`;
  const headers = {
    "Content-Type": avatar.type,
    // Private: it's per-session content.
    "Cache-Control": "private, no-cache",
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(new Uint8Array(avatar.data), { headers });
}

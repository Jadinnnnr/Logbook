import { getSessionUser } from "@/lib/auth";
import { avatarForUser } from "@/lib/db";

/**
 * Serves the signed-in pilot's own profile picture. Deliberately scoped to the
 * session rather than taking a user id, so one pilot can't enumerate another's.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const avatar = avatarForUser(user.id);
  if (!avatar) return new Response("No profile picture", { status: 404 });
  return new Response(new Uint8Array(avatar.data), {
    headers: {
      "Content-Type": avatar.type,
      // Private: it's per-session content, and it changes when they re-upload.
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

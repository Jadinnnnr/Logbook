import { getSessionUser } from "@/lib/auth";
import { archiveForUser } from "@/lib/db";
import { encodeBackup, backupFilename } from "@/lib/backup";

/**
 * The whole logbook as a download.
 *
 * Scoped to the signed-in pilot — `archiveForUser` takes a user_id and every
 * query inside it is filtered on that, so one account can never export another.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const json = encodeBackup(archiveForUser(user.id));
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backupFilename()}"`,
      // A logbook is personal; never let a proxy hold a copy.
      "Cache-Control": "no-store",
    },
  });
}

import { getSessionUser } from "@/lib/auth";
import { flightsForUser } from "@/lib/db";
import { flightsToCsv } from "@/lib/csv";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Not signed in", { status: 401 });
  }
  const flights = flightsForUser(user.id).slice().reverse(); // oldest first for export
  const csv = flightsToCsv(flights);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="logbook.csv"',
    },
  });
}

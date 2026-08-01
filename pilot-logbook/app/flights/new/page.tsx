import { requireUser } from "@/lib/auth";
import { aircraftForUser } from "@/lib/db";
import FlightForm from "@/components/FlightForm";

export default async function NewFlightPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { error } = await searchParams;
  const fleet = aircraftForUser(user.id);
  return (
    <main className="container">
      <h1>Log Flight</h1>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <FlightForm fleet={fleet} />
      </div>
    </main>
  );
}

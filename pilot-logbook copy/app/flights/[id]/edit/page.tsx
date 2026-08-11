import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { aircraftForUser, flightById } from "@/lib/db";
import FlightForm from "@/components/FlightForm";

export default async function EditFlightPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;
  const flight = flightById(user.id, Number(id));
  if (!flight) notFound();
  return (
    <main className="container">
      <h1>Edit flight — {flight.date}</h1>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <FlightForm flight={flight} fleet={aircraftForUser(user.id)} />
      </div>
    </main>
  );
}

import { requireUser } from "@/lib/auth";
import { aircraftForUser, Aircraft } from "@/lib/db";
import { categoryClassLabel, AIRCRAFT_FLAGS } from "@/lib/aircraft";
import { registryAvailable } from "@/lib/registry";
import { deleteAircraft } from "@/lib/actions";
import AircraftForm from "@/components/AircraftForm";

function flagBadges(a: Aircraft): string {
  return AIRCRAFT_FLAGS.filter(([col]) => a[col as keyof Aircraft]).map(([, label]) => label).join(", ");
}

export default async function AircraftPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; edit?: string }>;
}) {
  const user = await requireUser();
  const { error, edit } = await searchParams;
  const fleet = aircraftForUser(user.id);
  const editing = edit ? fleet.find((a) => a.id === Number(edit)) : undefined;

  return (
    <main className="container">
      <h1>Aircraft</h1>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ maxWidth: 560 }}>
        <h2>{editing ? `Edit ${editing.tail_number}` : "Add Aircraft"}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Profiles let currency and proficiency be tracked per FAA category and class.
          Flights are matched to a profile by tail number.
        </p>
        <AircraftForm
          registryAvailable={registryAvailable()}
          editing={
            editing && {
              id: editing.id,
              tail_number: editing.tail_number,
              aircraft_type: editing.aircraft_type,
              make_model: editing.make_model,
              category_class: editing.category_class,
              is_complex: Boolean(editing.is_complex),
              is_high_performance: Boolean(editing.is_high_performance),
              is_taa: Boolean(editing.is_taa),
              is_tailwheel: Boolean(editing.is_tailwheel),
              notes: editing.notes,
            }
          }
        />
      </div>

      {fleet.length > 0 && (
        <div className="card table-wrap">
          <h2>Your Aircraft</h2>
          <table>
            <thead>
              <tr>
                <th>Tail</th>
                <th>Type</th>
                <th>Make &amp; model</th>
                <th>Category / class</th>
                <th>Characteristics</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fleet.map((a) => (
                <tr key={a.id}>
                  <td><a href={`/aircraft?edit=${a.id}`}>{a.tail_number}</a></td>
                  <td>{a.aircraft_type}</td>
                  <td>{a.make_model}</td>
                  <td>{categoryClassLabel(a.category_class)}</td>
                  <td style={{ whiteSpace: "normal" }}>{flagBadges(a)}</td>
                  <td style={{ whiteSpace: "normal" }}>{a.notes}</td>
                  <td>
                    <form action={deleteAircraft} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn-danger" type="submit">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

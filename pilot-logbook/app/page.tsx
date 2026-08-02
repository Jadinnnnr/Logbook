import { requireUser } from "@/lib/auth";
import { aircraftByTail, credentialsForUser, flightsForUser } from "@/lib/db";
import {
  computeTotals,
  computeCurrency,
  computeSpecialTime,
  fmtHours,
  CurrencyState,
  CurrencyItem,
} from "@/lib/currency";
import { computeActions } from "@/lib/planner";

const STATE_LABEL: Record<CurrencyState, string> = {
  good: "✓ Current",
  warning: "⚠ Action Soon",
  critical: "✕ Not Current",
};

/** Cards given a fixed slot in the grid; anything else falls into the stack. */
const PLACED = ["passenger", "medical", "review", "instrument"];

function renderCard(c: CurrencyItem) {
  return (
    <div key={c.id} className="currency-item">
      <div className="currency-label">{c.label}</div>
      <div className={`currency-status status-${c.state}`}>
        <span className="dot" aria-hidden />
        {STATE_LABEL[c.state]}
      </div>
      <div className="currency-detail">{c.detail}</div>
      {c.rows && (
        <ul className="tier-list">
          {c.rows.map((r) => (
            <li
              key={r.label}
              className={`tier tier-${r.state}${r.lapsed ? " tier-struck" : ""}`}
              title={r.scope}
            >
              <span className="tier-dot" aria-hidden />
              <span className="tier-label">{r.label}</span>
              <span className="tier-time">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="currency-ref" style={c.rows ? { marginTop: 8 } : undefined}>
        {c.reference}
      </div>
    </div>
  );
}

export default async function Dashboard() {
  const user = await requireUser();
  const flights = flightsForUser(user.id);
  const totals = computeTotals(flights);
  const byTail = aircraftByTail(user.id);
  const credentials = credentialsForUser(user);
  const currency = computeCurrency(flights, byTail, credentials);
  const medical = credentials.medical;
  const actions = computeActions(flights, byTail, credentials);
  const special = computeSpecialTime(flights, byTail);
  const specialTiles: [string, number][] = [
    ["Complex", special.complex],
    ["High Performance", special.highPerformance],
    ["TAA", special.taa],
    ["Tailwheel", special.tailwheel],
  ];
  const card = (id: string) => {
    const item = currency.find((c) => c.id === id);
    return item ? renderCard(item) : null;
  };

  return (
    <main className="container">
      <h1>Dashboard</h1>

      {/* The currency cards below say what your state is; this says what you'd
          have to go and fly about it. */}
      <div className="card">
        <h2>What Do I Need?</h2>
        {actions.length === 0 ? (
          <p className="plan-clear">
            <span className="dot" aria-hidden />
            Nothing outstanding — every currency below is good, with room to spare.
          </p>
        ) : (
          <ul className="plan-list">
            {actions.map((a) => (
              <li key={a.id} className={`plan-item status-${a.state}`}>
                <span className="dot" aria-hidden />
                <span className="plan-text">
                  <span className="plan-need">{a.need}</span> {a.purpose}
                  {a.note && <span className="plan-note">{a.note}</span>}
                </span>
                <span className="plan-ref">{a.reference}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid-tiles">
        <div className="tile">
          <div className="tile-label">Total Time</div>
          <div className="tile-value">{fmtHours(totals.totalTime)}</div>
          <div className="tile-sub">{totals.flights} flights</div>
        </div>
        <div className="tile">
          <div className="tile-label">PIC</div>
          <div className="tile-value">{fmtHours(totals.pic)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Night</div>
          <div className="tile-value">{fmtHours(totals.night)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Cross-Country</div>
          <div className="tile-value">{fmtHours(totals.crossCountry)}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Instrument</div>
          <div className="tile-value">{fmtHours(totals.actualInstrument + totals.simulatedInstrument)}</div>
          <div className="tile-sub">{fmtHours(totals.actualInstrument)} actual</div>
        </div>
        <div className="tile">
          <div className="tile-label">Landings</div>
          <div className="tile-value">{totals.dayLandings + totals.nightLandings}</div>
          <div className="tile-sub">{totals.nightLandings} night</div>
        </div>
        {specialTiles.filter(([, v]) => v > 0).map(([label, v]) => (
          <div className="tile" key={label}>
            <div className="tile-label">{label}</div>
            <div className="tile-value">{fmtHours(v)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Currency</h2>
        {/* Passenger and Medical are the tall, row-bearing cards, so each takes
            a column of its own; the two compact cards stack in the third. */}
        <div className="currency-grid">
          {card("passenger")}
          {card("medical")}
          <div className="currency-stack">
            {card("review")}
            {card("instrument")}
            {currency.filter((c) => !PLACED.includes(c.id)).map(renderCard)}
          </div>
        </div>
      </div>

    </main>
  );
}

"use client";

import { useMemo, useState } from "react";
import { saveToldProfile, deleteToldProfile } from "@/lib/actions";
import PerformanceCalculator, { type PerformanceSeed } from "./PerformanceCalculator";
import {
  blankProfile,
  isUsable,
  computeWeightBalance,
  emptyInput,
  hasEnvelope,
  chartMinWeight,
  chartMaxWeight,
  envelopeValue,
  POUNDS_PER_GALLON,
  type Point,
  type Profile,
  type WBInput,
  type Limit,
} from "@/lib/weightbalance";

/** No airport on this page, so nothing to prefill the distance card from. */
const EMPTY_SEED: PerformanceSeed = {
  ident: null,
  name: null,
  elevationFt: null,
  runways: [],
  altimeterInHg: null,
  temperatureC: null,
  windDir: null,
  windSpeed: null,
  observed: null,
};

const dec = (n: number, places = 1) =>
  n.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places });

/** Blank at zero, so a fresh card reads as fields to fill rather than data to clear. */
function NumberField({
  label,
  sub,
  value,
  onChange,
  unit,
}: {
  label: string;
  sub?: string;
  value: number;
  onChange: (n: number) => void;
  unit: string;
}) {
  // The text is held locally with the number as the source of truth: deriving
  // the string from the number on every keystroke would rewrite "1." to "1" the
  // moment you typed the decimal point.
  const [text, setText] = useState(value === 0 ? "" : String(value));
  return (
    <div className="field">
      <label>
        {label}
        {sub && <span className="field-hint"> {sub}</span>}
      </label>
      <div className="wb-input">
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseFloat(e.target.value.replace(",", "."));
            onChange(Number.isFinite(parsed) ? parsed : 0);
          }}
        />
        <span className="muted">{unit}</span>
      </div>
    </div>
  );
}

function CardRow({
  label,
  weight,
  arm,
  moment,
  strong,
}: {
  label: string;
  weight: number;
  arm: number;
  moment: number;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? "wb-total" : undefined}>
      <td>{label}</td>
      <td className="num">{weight === 0 ? "—" : dec(weight)}</td>
      <td className="num">{arm === 0 ? "—" : dec(arm, 2)}</td>
      <td className="num">{moment === 0 ? "—" : dec(moment)}</td>
    </tr>
  );
}

function PointRow({ label, point }: { label: string; point: Point }) {
  return (
    <tr className="wb-total">
      <td>
        {label}
        {point.withinEnvelope !== null && (
          <span className={point.withinEnvelope ? "wb-ok" : "wb-bad"}>
            {point.withinEnvelope ? " within the envelope" : " outside the envelope"}
          </span>
        )}
      </td>
      <td className={point.overGross ? "num wb-bad" : "num"}>{dec(point.weight)}</td>
      <td className="num">{point.cg === null ? "—" : dec(point.cg, 2)}</td>
      <td className="num">{dec(point.moment)}</td>
    </tr>
  );
}

/** The envelope with the plotted points on it. */
function EnvelopeChart({
  profile,
  points,
}: {
  profile: Profile;
  points: { point: Point; filled: boolean }[];
}) {
  const W = 520;
  const H = 320;
  const pad = { top: 12, right: 14, bottom: 34, left: 54 };

  const values = [...profile.forwardLimit, ...profile.aftLimit].map((l) => l.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // Proportional margin, since moments run to tens of thousands and centres of
  // gravity to tens.
  const margin = Math.max((hi - lo) * 0.08, profile.envelopeAxis === "cg" ? 1 : 500);
  const vMin = lo - margin;
  const vMax = hi + margin;
  const wMin = chartMinWeight(profile);
  const wMax = chartMaxWeight(profile);

  const x = (v: number) => pad.left + ((v - vMin) / (vMax - vMin)) * (W - pad.left - pad.right);
  const y = (w: number) => H - pad.bottom - ((w - wMin) / (wMax - wMin)) * (H - pad.top - pad.bottom);

  const outline = [
    ...profile.forwardLimit.map((l) => `${x(l.value)},${y(l.weight)}`),
    ...[...profile.aftLimit].reverse().map((l) => `${x(l.value)},${y(l.weight)}`),
  ].join(" ");

  const weightTicks = Array.from({ length: 5 }, (_, i) => wMin + ((wMax - wMin) * i) / 4);
  const valueTicks = Array.from({ length: 5 }, (_, i) => vMin + ((vMax - vMin) * i) / 4);
  const tickLabel = (v: number) =>
    profile.envelopeAxis === "moment" ? dec(v / 1000, 0) : dec(v, 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="wb-chart" role="img" aria-label="Loading envelope">
      {weightTicks.map((w) => (
        <g key={w}>
          <line x1={pad.left} y1={y(w)} x2={W - pad.right} y2={y(w)} className="wb-grid" />
          <text x={pad.left - 8} y={y(w) + 3} className="wb-axis" textAnchor="end">
            {dec(w, 0)}
          </text>
        </g>
      ))}
      {valueTicks.map((v) => (
        <text key={v} x={x(v)} y={H - pad.bottom + 16} className="wb-axis" textAnchor="middle">
          {tickLabel(v)}
        </text>
      ))}
      <polygon points={outline} className="wb-envelope" />
      {points.map(({ point, filled }, i) => {
        const v = envelopeValue(point, profile);
        if (v === null || point.weight < wMin || point.weight > wMax || v < vMin || v > vMax) {
          return null;
        }
        return (
          <circle
            key={i}
            cx={x(v)}
            cy={y(point.weight)}
            r={5}
            className={filled ? "wb-dot wb-dot-filled" : "wb-dot"}
          />
        );
      })}
      <text x={W / 2} y={H - 6} className="wb-axis" textAnchor="middle">
        {profile.envelopeAxis === "moment"
          ? "Moment — 1000 in-lb"
          : "C.G. location (inches aft datum)"}
      </text>
    </svg>
  );
}

export default function TOLDCalculator({
  profiles,
  initialProfileId,
}: {
  profiles: Profile[];
  initialProfileId?: string;
}) {
  const [profileId, setProfileId] = useState(initialProfileId ?? profiles[0]?.id ?? "");
  const [input, setInput] = useState<WBInput>(emptyInput());
  const [tail, setTail] = useState("");

  // Falls back to the first profile if the stored selection was deleted.
  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];
  const card = useMemo(() => computeWeightBalance(input, profile), [input, profile]);

  const set = (patch: Partial<WBInput>) => setInput((prev) => ({ ...prev, ...patch }));
  const toggleExtra = (id: string) =>
    set({
      extras: input.extras.includes(id)
        ? input.extras.filter((e) => e !== id)
        : [...input.extras, id],
    });

  return (
    <>
      <div className="card" style={{ maxWidth: 620 }}>
        <div className="field">
          <label htmlFor="wb-profile">Aircraft profile</label>
          <select
            id="wb-profile"
            value={profile?.id ?? ""}
            onChange={(e) => {
              setProfileId(e.target.value);
              // A new aeroplane means new arms; keeping the old numbers would
              // silently recompute somebody else's card.
              setInput(emptyInput());
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {!profile?.limitsVerified && (
          <p className="wb-warning">
            The CG envelope for {profile?.name} hasn&rsquo;t been confirmed against the POH.
            Weights and centres of gravity are computed exactly; the in-limits check is switched
            off until the limits are checked. Plot it on the paper chart before you fly.
          </p>
        )}

        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="wb-tail">Tail number</label>
          <input
            id="wb-tail"
            value={tail}
            onChange={(e) => setTail(e.target.value.toUpperCase())}
            placeholder="N…"
          />
        </div>

        <div className="form-grid">
          <NumberField
            label="Basic empty weight"
            value={input.emptyWeight}
            onChange={(n) => set({ emptyWeight: n })}
            unit="lb"
          />
          <NumberField
            label="Empty arm"
            value={input.emptyArm}
            onChange={(n) => set({ emptyArm: n })}
            unit="in"
          />
          <NumberField
            label={profile.frontLabel}
            sub={`arm ${dec(profile.seats12Arm, 1)}`}
            value={input.seats12}
            onChange={(n) => set({ seats12: n })}
            unit="lb"
          />
          <NumberField
            label={profile.rearLabel}
            sub={`arm ${dec(profile.seats34Arm, 1)}`}
            value={input.seats34}
            onChange={(n) => set({ seats34: n })}
            unit="lb"
          />
          <NumberField
            label={profile.baggageLabel}
            sub={`arm ${dec(profile.baggageArm, 1)}`}
            value={input.baggage}
            onChange={(n) => set({ baggage: n })}
            unit="lb"
          />
          <NumberField
            label="Fuel"
            sub={`arm ${dec(profile.fuelArm, 1)}, ${dec(profile.fuelCapacityGal, 0)} gal max`}
            value={input.fuelGal}
            onChange={(n) => set({ fuelGal: n })}
            unit="gal"
          />
          {profile.hasFuelBurnChain && (
            <>
              <NumberField
                label="Taxi burn"
                value={input.taxiGal}
                onChange={(n) => set({ taxiGal: n })}
                unit="gal"
              />
              <NumberField
                label="Trip burn"
                value={input.tripGal}
                onChange={(n) => set({ tripGal: n })}
                unit="gal"
              />
            </>
          )}
        </div>

        {profile.extras.length > 0 && (
          <fieldset className="wb-extras">
            <legend>Adjustments</legend>
            {profile.extras.map((extra) => (
              <label key={extra.id} className="wb-extra">
                <input
                  type="checkbox"
                  checked={input.extras.includes(extra.id)}
                  onChange={() => toggleExtra(extra.id)}
                />
                <span>
                  {extra.label}{" "}
                  <span className="muted">
                    ({dec(extra.weight)} lb at {dec(extra.arm, 2)} in)
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <p className="muted" style={{ fontSize: 13 }}>
          Fuel is weighed at {POUNDS_PER_GALLON} lb per gallon, as on the printed card.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        <h2 style={{ marginTop: 0 }}>The card</h2>
        <table className="wb-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Weight</th>
              <th className="num">Arm</th>
              <th className="num">Moment</th>
            </tr>
          </thead>
          <tbody>
            {card.rows.map((row) => (
              <CardRow
                key={row.label}
                label={row.label}
                weight={row.weight}
                arm={row.arm}
                moment={row.moment}
              />
            ))}
            {profile.hasFuelBurnChain ? (
              <>
                <PointRow label="RAMP" point={card.ramp} />
                <CardRow
                  label="Taxi burn"
                  weight={-input.taxiGal * POUNDS_PER_GALLON}
                  arm={profile.fuelArm}
                  moment={-input.taxiGal * POUNDS_PER_GALLON * profile.fuelArm}
                />
                <PointRow label="TAKEOFF" point={card.takeoff} />
                <CardRow
                  label="Trip burn"
                  weight={-input.tripGal * POUNDS_PER_GALLON}
                  arm={profile.fuelArm}
                  moment={-input.tripGal * POUNDS_PER_GALLON * profile.fuelArm}
                />
                <PointRow label="LANDING" point={card.landing} />
              </>
            ) : (
              /* The Citabria's card stops at a total. */
              <PointRow label="TOTAL" point={card.ramp} />
            )}
          </tbody>
        </table>

        {card.warnings.length > 0 && (
          <ul className="wb-warnings">
            {card.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        {profile.note && (
          <p className="muted" style={{ fontSize: 13 }}>
            {profile.note}
          </p>
        )}
      </div>

      {/* The takeoff weight the card just worked out is what the distance chart
          wants, so it carries across instead of being typed again. There is no
          airport here, so pressure altitude, temperature and headwind are typed
          — the Performance page is where those come from an airport and its
          METAR. */}
      <PerformanceCalculator
        seed={EMPTY_SEED}
        section="distance"
        defaultGrossWeight={card.takeoff.weight > 0 ? card.takeoff.weight : undefined}
      />

      <ProfileEditor existing={profile} />

      <div className="card" style={{ maxWidth: 620 }}>
        <h2 style={{ marginTop: 0 }}>
          {profile.envelopeAxis === "moment" ? "Weight vs. moment envelope" : "Weight vs. CG envelope"}
        </h2>
        {hasEnvelope(profile) ? (
          <>
            <EnvelopeChart
              profile={profile}
              points={
                profile.hasFuelBurnChain
                  ? [
                      { point: card.landing, filled: false },
                      { point: card.takeoff, filled: true },
                    ]
                  : [{ point: card.ramp, filled: true }]
              }
            />
            <p className="muted" style={{ fontSize: 13 }}>
              {dec(profile.maxGrossLb, 0)} lb maximum gross.{" "}
              {profile.hasFuelBurnChain
                ? "Takeoff is the filled dot, landing the open one."
                : "The total is the filled dot."}
            </p>
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>
            This profile has no envelope transcribed, so there&rsquo;s nothing to plot against. The
            weights, arms and moments above are exact — take the total to the chart on the card.
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Add an aircraft of your own, or remove one you added.
 *
 * Every number here comes off that aeroplane's POH. Nothing is defaulted to
 * another type's figures — a plausible-looking arm from the wrong aircraft is
 * worse than an empty box, because an empty box stops you and a wrong number
 * doesn't.
 */
function ProfileEditor({ existing }: { existing: Profile }) {
  const [draft, setDraft] = useState<Profile>(() => blankProfile("new"));
  const [forward, setForward] = useState<Limit[]>([
    { weight: 0, value: 0 },
    { weight: 0, value: 0 },
  ]);
  const [aft, setAft] = useState(0);
  const [open, setOpen] = useState(false);

  const assembled: Profile = {
    ...draft,
    forwardLimit: forward
      .filter((l) => l.weight > 0 && l.value > 0)
      .sort((a, b) => a.weight - b.weight),
    aftLimit: aft > 0 ? [{ weight: 0, value: aft }] : [],
  };
  const set = (patch: Partial<Profile>) => setDraft((p) => ({ ...p, ...patch }));

  return (
    <div className="card" style={{ maxWidth: 620 }}>
      <h2 style={{ marginTop: 0 }}>Your aircraft</h2>

      {!existing.isBuiltIn && (
        <form action={deleteToldProfile} className="stack" style={{ marginBottom: 14 }}>
          <input type="hidden" name="id" value={existing.id} />
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            <strong>{existing.name}</strong> is one of yours.
          </p>
          <button type="submit" className="danger">Delete this profile</button>
        </form>
      )}

      <button type="button" className="btn-secondary" onClick={() => setOpen(!open)}>
        {open ? "Cancel" : "Add an aircraft"}
      </button>

      {open && (
        <form action={saveToldProfile} className="stack" style={{ marginTop: 12 }}>
          {/* Assembled client-side and posted whole, so the shape stays in one
              place rather than being reconstructed from twenty form fields. */}
          <input type="hidden" name="profile" value={JSON.stringify(assembled)} />

          <div className="field">
            <label>Name</label>
            <input
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. C172S Skyhawk G1000"
            />
          </div>

          <div className="form-grid">
            <NumberField label="Seats 1 + 2 arm" value={draft.seats12Arm}
              onChange={(n) => set({ seats12Arm: n })} unit="in" />
            <NumberField label="Seats 3 + 4 arm" value={draft.seats34Arm}
              onChange={(n) => set({ seats34Arm: n })} unit="in" />
            <NumberField label="Baggage arm" value={draft.baggageArm}
              onChange={(n) => set({ baggageArm: n })} unit="in" />
            <NumberField label="Fuel arm" value={draft.fuelArm}
              onChange={(n) => set({ fuelArm: n })} unit="in" />
            <NumberField label="Fuel capacity" value={draft.fuelCapacityGal}
              onChange={(n) => set({ fuelCapacityGal: n })} unit="gal" />
            <NumberField label="Maximum gross" value={draft.maxGrossLb}
              onChange={(n) => set({ maxGrossLb: n })} unit="lb" />
            <NumberField label="Maximum baggage" sub="0 to skip the warning"
              value={draft.maxBaggageLb} onChange={(n) => set({ maxBaggageLb: n })} unit="lb" />
          </div>

          <fieldset className="wb-extras">
            <legend>Forward CG limit</legend>
            {forward.map((point, i) => (
              <div className="wb-extra" key={i}>
                <NumberField label="Weight" value={point.weight} unit="lb"
                  onChange={(n) => setForward((f) =>
                    f.map((x, j) => (j === i ? { ...x, weight: n } : x)))} />
                <NumberField label="CG" value={point.value} unit="in"
                  onChange={(n) => setForward((f) =>
                    f.map((x, j) => (j === i ? { ...x, value: n } : x)))} />
              </div>
            ))}
            <button type="button" className="btn-secondary"
              onClick={() => setForward((f) => [...f, { weight: 0, value: 0 }])}>
              Add a breakpoint
            </button>
            <div style={{ marginTop: 10 }}>
              <NumberField label="Aft limit" value={aft} onChange={setAft} unit="in" />
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
              A straight line is drawn between breakpoints. Two is usual: the forward limit at low
              weight, and the further-aft one at maximum gross. Leave these blank and the card
              still adds up — there just won&rsquo;t be an envelope to plot against.
            </p>
          </fieldset>

          <label className="wb-extra">
            <input type="checkbox" checked={draft.limitsVerified}
              onChange={(e) => set({ limitsVerified: e.target.checked })} />
            <span>
              Checked against the POH
              <span className="muted">
                {" "}— leave off until you&rsquo;ve read these off the POH rather than a chart.
                While it&rsquo;s off, no in-limits verdict is given.
              </span>
            </span>
          </label>

          <div>
            <button type="submit" disabled={!isUsable(assembled)}>Save profile</button>
          </div>
        </form>
      )}
    </div>
  );
}

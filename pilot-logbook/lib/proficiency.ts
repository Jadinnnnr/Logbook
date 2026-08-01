import { Flight } from "./db";

/**
 * Estimated proficiency: a transparent recency heuristic, NOT a regulatory
 * measure. Each metric compares recent activity against a "staying sharp"
 * target and scores 0–100; the overall score is a weighted average of the
 * applicable metrics. Targets are deliberately modest GA-pilot defaults.
 */

export type ProficiencyState = "sharp" | "fair" | "rusty";

export interface ProficiencyMetric {
  key: string;
  label: string;
  score: number; // 0-100
  state: ProficiencyState;
  weight: number;
  detail: string;
  applicable: boolean;
}

export interface ProficiencyReport {
  overall: number;
  state: ProficiencyState;
  daysSinceLastFlight: number | null;
  metrics: ProficiencyMetric[];
}

function stateFor(score: number): ProficiencyState {
  return score >= 75 ? "sharp" : score >= 40 ? "fair" : "rusty";
}

function clamp100(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number, from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return fmtDate(d);
}

export function computeProficiency(flights: Flight[], now = new Date()): ProficiencyReport {
  const cut90 = daysAgo(90, now);
  const cut180 = daysAgo(180, now);
  const last90 = flights.filter((f) => f.date >= cut90);
  const last180 = flights.filter((f) => f.date >= cut180);

  const newest = flights.reduce<string | null>((m, f) => (m === null || f.date > m ? f.date : m), null);
  const daysSinceLastFlight = newest
    ? Math.max(0, Math.floor((now.getTime() - new Date(newest + "T00:00:00").getTime()) / 86400000))
    : null;

  const hours90 = last90.reduce((s, f) => s + f.total_time, 0);
  const landings90 = last90.reduce((s, f) => s + f.day_landings + f.night_landings, 0);
  const nightLandings90 = last90.reduce((s, f) => s + f.night_landings, 0);
  const nightHours90 = last90.reduce((s, f) => s + f.night, 0);
  const approaches180 = last180.reduce((s, f) => s + f.approaches, 0);
  const holds180 = last180.reduce((s, f) => s + f.holds, 0);
  const instHours180 = last180.reduce((s, f) => s + f.actual_instrument + f.simulated_instrument, 0);
  const everInstrument = flights.some((f) => f.actual_instrument + f.simulated_instrument > 0 || f.approaches > 0);
  const everNight = flights.some((f) => f.night > 0 || f.night_landings > 0);

  // Freshness: full credit up to 14 days since the last flight, fading to 0 at 120.
  const freshness =
    daysSinceLastFlight === null ? 0 : clamp100(((120 - Math.max(daysSinceLastFlight, 14)) / (120 - 14)) * 100);

  const metrics: ProficiencyMetric[] = [
    {
      key: "recency",
      label: "Recent Flight Time",
      score: clamp100((hours90 / 15) * 80 + (freshness / 100) * 20),
      state: "sharp",
      weight: 30,
      detail: `${hours90.toFixed(1)} hrs in the last 90 days (target 15). Last flight ${
        daysSinceLastFlight === null ? "never" : daysSinceLastFlight + " days ago"
      }.`,
      applicable: true,
    },
    {
      key: "landings",
      label: "Landings & Pattern Work",
      score: clamp100((landings90 / 10) * 100),
      state: "sharp",
      weight: 25,
      detail: `${landings90} landings in the last 90 days (target 10).`,
      applicable: true,
    },
    {
      key: "instrument",
      label: "Instrument",
      score: clamp100((approaches180 / 6) * 50 + Math.min(holds180, 2) * 15 + (instHours180 / 3) * 20),
      state: "sharp",
      weight: 30,
      detail: `${approaches180} approaches, ${holds180} holds, ${instHours180.toFixed(1)} hrs actual/sim in the last 6 months (targets: 6 approaches, 1+ hold, 3 hrs — see 61.57(c)).`,
      applicable: everInstrument,
    },
    {
      key: "night",
      label: "Night",
      score: clamp100((nightLandings90 / 3) * 60 + (nightHours90 / 2) * 40),
      state: "sharp",
      weight: 15,
      detail: `${nightLandings90} night landings and ${nightHours90.toFixed(1)} night hrs in the last 90 days (targets: 3 landings, 2 hrs).`,
      applicable: everNight,
    },
  ];
  for (const m of metrics) m.state = stateFor(m.score);

  const applicable = metrics.filter((m) => m.applicable);
  const totalWeight = applicable.reduce((s, m) => s + m.weight, 0);
  const overall = totalWeight
    ? clamp100(applicable.reduce((s, m) => s + m.score * m.weight, 0) / totalWeight)
    : 0;

  return { overall, state: stateFor(overall), daysSinceLastFlight, metrics };
}

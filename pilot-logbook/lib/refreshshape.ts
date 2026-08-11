/**
 * The shape of a refresh run, and how far through it is.
 *
 * Deliberately free of `server-only`, `fs`, and `better-sqlite3`: the progress
 * bar is a client component, and `lib/datastatus` — which reads the status file
 * and opens the datasets — can't be imported from the browser. This module is
 * the part both sides share.
 */

export interface RefreshStep {
  key: string;
  label: string;
  state: "pending" | "running" | "done" | "error";
  message: string;
  /** 0–1 through this step, or null before it has reported anything. */
  fraction?: number | null;
  /** What it is working on right now, e.g. "14 CFR part 91". */
  stage?: string;
}

export interface RefreshStatus {
  state: "running" | "done" | "error";
  startedAt: string;
  finishedAt: string | null;
  steps: RefreshStep[];
}

/**
 * How far through the whole refresh we are, 0–1.
 *
 * Steps are weighted equally. That is a lie in the small — the registry takes
 * far longer than the FAR/AIM copy — but a bar that stalls at a truthful 8% for
 * six minutes is read as broken, and the point of this one is to say "still
 * alive" rather than to predict a finish time.
 */
export function refreshFraction(status: RefreshStatus | null): number {
  if (!status || status.steps.length === 0) return 0;
  const total = status.steps.reduce((sum, step) => {
    if (step.state === "done" || step.state === "error") return sum + 1;
    if (step.state === "running") return sum + (step.fraction ?? 0);
    return sum;
  }, 0);
  return Math.min(1, total / status.steps.length);
}

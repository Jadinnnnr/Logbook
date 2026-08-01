import type { Flight } from "./db";

/** Selectable spans for the stats page. */
export const RANGE_PRESETS: [string, string][] = [
  ["30", "Past 30 Days"],
  ["180", "Past 180 Days"],
  ["365", "Past Year"],
  ["all", "All Time"],
  ["custom", "Custom Range"],
];

export interface ResolvedRange {
  key: string;
  label: string;
  /** Inclusive YYYY-MM-DD bounds; `from` is null for all-time. */
  from: string | null;
  to: string;
  /** Bucket width for the over-time chart, chosen from the span. */
  bucket: "day" | "week" | "month" | "year";
}

function fmt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysBefore(days: number, from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days + 1); // inclusive of today
  return fmt(d);
}

function isDate(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Wider spans get coarser buckets so the chart never turns into a picket fence. */
function bucketFor(spanDays: number): ResolvedRange["bucket"] {
  if (spanDays <= 31) return "day";
  if (spanDays <= 120) return "week";
  if (spanDays <= 1100) return "month";
  return "year";
}

export function resolveRange(
  params: { range?: string; from?: string; to?: string },
  flights: Flight[],
  now = new Date()
): ResolvedRange {
  const today = fmt(now);
  const key = RANGE_PRESETS.some(([k]) => k === params.range) ? params.range! : "365";

  if (key === "custom" && (isDate(params.from) || isDate(params.to))) {
    const earliest = flights.reduce<string | null>((m, f) => (m === null || f.date < m ? f.date : m), null);
    const from = isDate(params.from) ? params.from : earliest ?? today;
    const to = isDate(params.to) ? params.to : today;
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    const span = Math.max(1, Math.round((new Date(hi).getTime() - new Date(lo).getTime()) / 86400000) + 1);
    return { key: "custom", label: `${lo} to ${hi}`, from: lo, to: hi, bucket: bucketFor(span) };
  }

  if (key === "all") {
    const earliest = flights.reduce<string | null>((m, f) => (m === null || f.date < m ? f.date : m), null);
    const span = earliest
      ? Math.round((now.getTime() - new Date(earliest).getTime()) / 86400000) + 1
      : 365;
    return { key: "all", label: "All Time", from: null, to: today, bucket: bucketFor(span) };
  }

  const days = Number(key);
  return {
    key,
    label: RANGE_PRESETS.find(([k]) => k === key)![1],
    from: daysBefore(days, now),
    to: today,
    bucket: bucketFor(days),
  };
}

export function flightsInRange(flights: Flight[], range: ResolvedRange): Flight[] {
  return flights.filter((f) => (range.from === null || f.date >= range.from) && f.date <= range.to);
}

/** Bucket key + display label for a date, per the resolved bucket width. */
function bucketOf(date: string, bucket: ResolvedRange["bucket"]): { key: string; label: string } {
  const d = new Date(date + "T00:00:00");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  switch (bucket) {
    case "day":
      return { key: date, label: `${d.getDate()} ${months[d.getMonth()]}` };
    case "week": {
      // Week starting Monday.
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return { key: fmt(monday), label: `${monday.getDate()} ${months[monday.getMonth()]}` };
    }
    case "month":
      return { key: date.slice(0, 7), label: months[d.getMonth()] };
    case "year":
      return { key: date.slice(0, 4), label: date.slice(0, 4) };
  }
}

/**
 * Total hours per bucket across the range, including empty buckets so gaps in
 * flying are visible rather than silently closed up.
 */
export function hoursOverTime(
  flights: Flight[],
  range: ResolvedRange
): { label: string; value: number }[] {
  const inRange = flightsInRange(flights, range);
  const start = range.from ?? inRange.reduce<string>((m, f) => (f.date < m ? f.date : m), range.to);
  const totals = new Map<string, { label: string; value: number }>();

  // Seed every bucket in the span so quiet periods show as zero-height bars.
  const cursor = new Date(start + "T00:00:00");
  const end = new Date(range.to + "T00:00:00");
  const step = range.bucket === "day" ? 1 : range.bucket === "week" ? 7 : 1;
  while (cursor <= end) {
    const b = bucketOf(fmt(cursor), range.bucket);
    if (!totals.has(b.key)) totals.set(b.key, { label: b.label, value: 0 });
    if (range.bucket === "month") cursor.setMonth(cursor.getMonth() + 1);
    else if (range.bucket === "year") cursor.setFullYear(cursor.getFullYear() + 1);
    else cursor.setDate(cursor.getDate() + step);
  }
  // The loop can overshoot the final partial bucket; make sure it exists.
  const last = bucketOf(range.to, range.bucket);
  if (!totals.has(last.key)) totals.set(last.key, { label: last.label, value: 0 });

  for (const f of inRange) {
    const b = bucketOf(f.date, range.bucket);
    const entry = totals.get(b.key) ?? { label: b.label, value: 0 };
    entry.value += f.total_time;
    totals.set(b.key, entry);
  }

  return [...totals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, v]) => ({ ...v, value: Math.round(v.value * 10) / 10 }));
}

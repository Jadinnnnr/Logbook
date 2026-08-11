import type { Flight } from "./db";

/** Parse CSV text into rows of fields, handling quoted fields and embedded commas/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const EXPORT_COLUMNS: [string, keyof Flight][] = [
  ["Date", "date"],
  ["AircraftType", "aircraft_type"],
  ["TailNumber", "tail_number"],
  ["From", "from_airport"],
  ["To", "to_airport"],
  ["Route", "route"],
  ["TotalTime", "total_time"],
  ["PIC", "pic"],
  ["SIC", "sic"],
  ["DualReceived", "dual_received"],
  ["Solo", "solo"],
  ["Night", "night"],
  ["CrossCountry", "cross_country"],
  ["ActualInstrument", "actual_instrument"],
  ["SimulatedInstrument", "simulated_instrument"],
  ["DayLandings", "day_landings"],
  ["NightLandings", "night_landings"],
  ["NightFullStopLandings", "night_full_stop_landings"],
  ["Approaches", "approaches"],
  ["Holds", "holds"],
  ["Remarks", "remarks"],
];

export function flightsToCsv(flights: Flight[]): string {
  const lines = [EXPORT_COLUMNS.map(([h]) => h).join(",")];
  for (const f of flights) {
    lines.push(EXPORT_COLUMNS.map(([, k]) => csvEscape(f[k] as string | number)).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Normalize a header for matching: lowercase, alphanumerics only. */
function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Accepts our own export headers plus common ForeFlight / LogTen column names.
const HEADER_MAP: Record<string, string> = {
  date: "date",
  aircrafttype: "aircraft_type",
  typecode: "aircraft_type",
  type: "aircraft_type",
  model: "aircraft_type",
  tailnumber: "tail_number",
  aircraftid: "tail_number",
  registration: "tail_number",
  from: "from_airport",
  origin: "from_airport",
  to: "to_airport",
  destination: "to_airport",
  route: "route",
  totaltime: "total_time",
  totalduration: "total_time",
  pic: "pic",
  sic: "sic",
  dualreceived: "dual_received",
  dual: "dual_received",
  solo: "solo",
  night: "night",
  crosscountry: "cross_country",
  xc: "cross_country",
  actualinstrument: "actual_instrument",
  simulatedinstrument: "simulated_instrument",
  hood: "simulated_instrument",
  daylandings: "day_landings",
  daylandingsfullstop: "day_landings",
  alllandings: "day_landings",
  nightlandings: "night_landings",
  nightlandingsfullstop: "night_full_stop_landings",
  nightfullstoplandings: "night_full_stop_landings",
  approaches: "approaches",
  approach1: "approaches",
  holds: "holds",
  hold: "holds",
  remarks: "remarks",
  pilotcomments: "remarks",
  comments: "remarks",
};

export interface ImportResult {
  flights: Partial<Flight>[];
  skipped: number;
  recognizedColumns: string[];
}

const NUMERIC_FIELDS = new Set([
  "total_time", "pic", "sic", "dual_received", "solo", "night", "cross_country",
  "actual_instrument", "simulated_instrument",
]);
const INT_FIELDS = new Set([
  "day_landings", "night_landings", "night_full_stop_landings", "approaches", "holds",
]);

function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/**
 * Parse an imported logbook CSV. Scans for the header row (ForeFlight exports
 * have preamble sections before the flights table), maps recognized columns,
 * and skips rows without a parseable date.
 */
export function parseImport(text: string): ImportResult {
  const rows = parseCsv(text);
  // Find the header row: the first row where a cell normalizes to "date"
  // and at least two other cells are recognized columns.
  let headerIdx = -1;
  let mapping: (string | null)[] = [];
  for (let i = 0; i < Math.min(rows.length, 100); i++) {
    const mapped = rows[i].map((h) => HEADER_MAP[norm(h)] ?? null);
    if (mapped.includes("date") && mapped.filter(Boolean).length >= 3) {
      headerIdx = i;
      mapping = mapped;
      break;
    }
  }
  if (headerIdx === -1) {
    return { flights: [], skipped: rows.length, recognizedColumns: [] };
  }
  const dateCol = mapping.indexOf("date");
  const flights: Partial<Flight>[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIdx + 1)) {
    const date = normalizeDate(row[dateCol] ?? "");
    if (!date) {
      skipped++;
      continue;
    }
    const f: Partial<Flight> = { date };
    mapping.forEach((field, col) => {
      if (!field || field === "date" || col >= row.length) return;
      const raw = row[col].trim();
      if (raw === "") return;
      if (NUMERIC_FIELDS.has(field)) {
        const n = parseFloat(raw);
        if (!isNaN(n)) (f as Record<string, unknown>)[field] = ((f as Record<string, number>)[field] ?? 0) + n;
      } else if (INT_FIELDS.has(field)) {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) (f as Record<string, unknown>)[field] = ((f as Record<string, number>)[field] ?? 0) + n;
      } else {
        const prev = (f as Record<string, string>)[field];
        (f as Record<string, unknown>)[field] = prev ? `${prev} ${raw}` : raw;
      }
    });
    flights.push(f);
  }
  const recognizedColumns = mapping.filter((m): m is string => m !== null);
  return { flights, skipped, recognizedColumns: [...new Set(recognizedColumns)] };
}

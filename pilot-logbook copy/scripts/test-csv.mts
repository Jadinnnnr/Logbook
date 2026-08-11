// Quick integration test for the CSV import/export logic, plus a data seeder
// for manual testing. Run with: node scripts/test-csv.mts [--seed]
import { parseImport, flightsToCsv } from "../lib/csv.ts";
import type { Flight } from "../lib/db.ts";

// --- Test 1: ForeFlight-style CSV with preamble sections ---
const foreflight = `ForeFlight Logbook Import,,,
,,,
Aircraft Table,,,
AircraftID,TypeCode,Make,Model
N738GB,C172,Cessna,172N
,,,
Flights Table,,,
Date,AircraftID,TypeCode,From,To,TotalTime,PIC,Night,DualReceived,DayLandingsFullStop,NightLandingsFullStop,Remarks
2026-06-15,N738GB,C172,KPAO,KSQL,1.2,1.2,0,0,3,0,Pattern work
2026-05-20,N4521B,PA28,KSQL,KMRY,2.3,2.3,0.4,0,1,1,"Dinner flight, coastal"
bad-date-row,N738GB,C172,KPAO,KPAO,1.0,1.0,0,0,1,0,skip me
2026-04-02,N738GB,C172,KHWD,KPAO,1.5,0,0,1.5,2,0,BFR prep with CFI
`;
const r = parseImport(foreflight);
console.log("T1 flights:", r.flights.length, "skipped:", r.skipped, "cols:", r.recognizedColumns.join("|"));
if (r.flights.length !== 3) throw new Error("expected 3 flights");
if (r.flights[1].remarks !== "Dinner flight, coastal") throw new Error("quoted comma failed: " + r.flights[1].remarks);
if (r.flights[1].night !== 0.4) throw new Error("night parse failed");
if (r.flights[1].night_full_stop_landings !== 1) throw new Error("nfs landings failed");
if (r.flights[2].dual_received !== 1.5) throw new Error("dual failed");

// --- Test 2: round-trip our own export format ---
const flightObj = {
  date: "2026-07-01", aircraft_type: "C172", tail_number: "N738GB",
  from_airport: "KPAO", to_airport: "KHAF", route: "", total_time: 1.4, pic: 1.4,
  sic: 0, dual_received: 0, solo: 0, night: 0.5, cross_country: 0,
  actual_instrument: 0, simulated_instrument: 0, day_landings: 2,
  night_landings: 1, night_full_stop_landings: 1, approaches: 2, holds: 1,
  remarks: 'He said "nice landing", twice',
} as Flight;
const rt = parseImport(flightsToCsv([flightObj]));
if (rt.flights.length !== 1) throw new Error("round-trip count");
if (rt.flights[0].remarks !== flightObj.remarks) throw new Error("round-trip quotes: " + rt.flights[0].remarks);
if (rt.flights[0].night_full_stop_landings !== 1) throw new Error("round-trip nfs landings");
if (rt.flights[0].total_time !== 1.4) throw new Error("round-trip total");
if (rt.flights[0].holds !== 1) throw new Error("round-trip holds");
if (rt.flights[0].approaches !== 2) throw new Error("round-trip approaches");
console.log("T2 round-trip OK");

// --- Optional: seed varied flights for the test user ---
if (process.argv.includes("--seed")) {
  const { getDb } = await import("../lib/db.ts");
  const db = getDb();
  const user = db.prepare("SELECT id FROM users WHERE email=?").get("testpilot@example.com") as { id: number } | undefined;
  if (!user) throw new Error("test user missing");
  const ins = db.prepare(`INSERT INTO flights (user_id,date,aircraft_type,tail_number,from_airport,to_airport,route,total_time,pic,sic,dual_received,solo,night,cross_country,actual_instrument,simulated_instrument,day_landings,night_landings,night_full_stop_landings,approaches,remarks)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const types: [string, string][] = [["C172", "N738GB"], ["C172", "N738GB"], ["PA28", "N4521B"], ["C182", "N9134M"]];
  const seed: (string | number)[][] = [];
  for (let m = 11; m >= 0; m--) {
    const n = ((m * 7) % 3) + 1;
    for (let k = 0; k < n; k++) {
      const [type, tail] = types[(m + k) % types.length];
      const total = 1 + ((m * 3 + k) % 5) * 0.4;
      const night = k === 0 && m % 3 === 0 ? 0.6 : 0;
      const dual = m % 4 === 0 ? total : 0;
      const d = new Date(2026, 6 - m, 3 + k * 9);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      seed.push([user.id, date, type, tail, "KPAO", k % 2 ? "KHAF" : "KSQL", "", total,
        dual ? 0 : total, 0, dual, 0, night, m % 2 ? total : 0, 0, m % 5 === 0 ? 0.3 : 0,
        2, night ? 1 : 0, night ? 1 : 0, m % 5 === 0 ? 1 : 0, ""]);
    }
  }
  seed.push([user.id, "2026-07-10", "C172", "N738GB", "KPAO", "KPAO", "", 1.1, 1.1, 0, 0, 0, 1.1, 0, 0, 0, 0, 3, 3, 0, "Night currency"]);
  db.transaction(() => seed.forEach((s) => ins.run(...s)))();
  console.log("Seeded", seed.length, "flights");
}

# Pilot Logbook

A multi-pilot digital logbook web app: flight logging with running totals, FAA
currency tracking, CSV import/export, and stats charts.

## Running it

The system Node on this Mac is v12, which is too old. Node 22 is installed at
`~/.local/node-v22.23.2-darwin-x64`; the launcher below sets that up for you.

**Easiest:** double-click **`Pilot Logbook.command`** in this folder (or
**`Pilot Logbook.app`**, which does the same thing and can be dragged to the
Dock or Applications). It sets the Node path, starts the server, waits for it to
answer, and opens your browser. Leave the Terminal window open while you use the
app; press Ctrl-C there to stop it. Launching it a second time while it's
already running just reopens the browser.

**From a terminal instead:**

```bash
export PATH="$HOME/.local/node-v22.23.2-darwin-x64/bin:$PATH"
npm run dev
```

Then open http://localhost:3000. Each pilot creates their own account; all data
stays local in `data/logbook.db` (SQLite).

## Features

- **Accounts** — each pilot signs up with a name, email, password (entered
  twice), and date of birth, then signs in with *either* the name or the email.
  The name is a single field doing both jobs — display name and sign-in handle —
  so it must be unique case-insensitively, and it can be changed at any time in
  Settings. Names allow letters, numbers, spaces and `. _ ' -` (2–30 chars) and
  are screened for profanity and slurs by `lib/username.ts`, which normalises
  leetspeak and repeated letters before matching. That module deliberately
  keeps two lists: long unambiguous terms matched anywhere, and short terms
  matched only as standalone words, plus an allowlist so ordinary words like
  "Scunthorpe" and names like "Dick Van Dyke" aren't rejected. Passwords are
  bcrypt-hashed and sessions are HMAC-signed cookies lasting 30 days. The date
  of birth collected at signup pre-fills the profile, where it drives the
  medical privilege calculations. Every pilot sees only their own flights.
- **Signed-out pages** render dark regardless of system setting, with a short
  product introduction beside the form.
- **Profile** (click your name in the nav) — certificates & ratings, medical
  certificates, and endorsements, each with dates, numbers, and notes. The
  newest medical drives the 61.23 currency card and an endorsement named
  "Flight review…" drives the 61.56 card, so currency stays in sync with the
  paperwork you actually hold. Dates within 60 days of expiring are flagged.
- **Appearance** (Settings) — light / dark / match-system theme, six accent
  presets, and a free color picker, all previewing live as you choose. Theme and
  accent are stored per user and server-rendered, so there's no flash of the
  wrong theme on load. Every preset ships a separate light and dark step
  verified at WCAG AA; a custom color is run through the same bar by
  `lib/color.ts`, which keeps the picked hue and saturation but walks its
  lightness until it clears 4.5:1 against the surface it sits on — separately
  per mode, since light and dark need opposite adjustments. A very pale or very
  dark pick will therefore shift. Chart colors deliberately keep their own
  colorblind-safe palette rather than following the accent.
- **Flight entry & totals** — date, aircraft, route, nine hour categories,
  landings (day / night / night full-stop), approaches, holds, remarks. Running
  totals on the dashboard and flights table.
- **Aircraft profiles** — tail number, type, make/model, FAA category/class,
  and characteristic flags (complex, high-performance, TAA, tailwheel) per
  aircraft. The flight form offers a profile dropdown; flights are matched to
  profiles by tail number. Time in flagged aircraft rolls up into dashboard
  tiles (complex time, HP time, etc.).
  - **Autofill from the tail number**: typing a US registration looks it up in
    the FAA Aircraft Registration database and fills in make & model, category/
    class, a best-effort type code, and the high-performance flag (from the
    engine's rated horsepower, >200 hp per 61.31(f)). Complex, TAA, and
    tailwheel are *not* published anywhere per-airframe, so those stay manual —
    as does the type code for makes the deriver doesn't recognise, since a blank
    field beats a wrong one. Anything you type yourself is never overwritten by
    a later lookup.
  - Build the lookup (optional — the form works without it):
    `curl -O https://registry.faa.gov/database/ReleasableAircraft.zip`, unzip,
    then `node scripts/build-registry.mjs <dir>`. Produces
    `data/faa-registry.db` (~19 MB, 315k registrations), which is gitignored and
    opened read-only and lazily. The FAA reissues the file regularly.
- **What do I need?** (top of the dashboard) — the currency cards say what your
  state is; this turns that into the list of things to go and fly: "6 approaches
  and 1 hold to regain instrument currency", "2 full-stop night landings to carry
  passengers at night", the flight review or medical when either is close. Only
  the shortfall is asked for, blockers sort ahead of warnings, and anything
  comfortably current stays off the list. It knows the 61.57(d) cliff — once
  instrument currency has been lapsed more than six calendar months it says an
  IPC instead of tasks. Rules live in `lib/planner.ts` as pure functions.
- **FAA currency** (dashboard) — four cards, each listing its checks as rows so
  related limits stay together. Passenger currency holds day and night in one
  card (split per category/class where profiles exist), and the medical card
  holds every privilege level. A card takes the state of its worst row, except
  the medical, which tracks its last level to expire:
  - Passenger currency, day — 3 takeoffs/landings in the preceding 90 days
    (14 CFR 61.57(a); takeoffs assumed equal to logged landings)
  - Passenger currency, night — 3 night full-stop landings in 90 days (61.57(b))
  - Flight review — 24 calendar months from the most recent qualifying event on
    your Profile, and the card names which one. A flight review endorsement
    counts, and so does anything that substitutes for one: a practical test for
    a certificate, rating, or operating privilege (61.56(d)), a 61.58 pilot
    proficiency check, or a WINGS phase (61.56(e)). An *instrument* proficiency
    check does not — 61.57(d) restores instrument currency but is not a check
    for a certificate or rating. Certificates carry an "earned by a practical
    test" flag, on by default, to be cleared for written-test-only certificates
    like Part 107 or Ground Instructor.
  - Instrument currency — 6 approaches + holding in the preceding 6 calendar
    months (61.57(c)), with the valid-through date computed from when the
    6th-newest approach (or newest hold) falls out of the window. Shown once
    the logbook contains any instrument activity.
  - Medical — a medical doesn't expire all at once, so the card lists each
    privilege level from 61.23(d) with its own remaining time. A first class
    stops covering ATP operations after 12 months (6 if you had reached 40 on
    or before the exam) but still covers commercial operations to 12 months and
    private operations to 60 months (24 if 40 or over); second and third class
    have their own shorter ladders. Lapsed levels are struck through, levels
    within 60 days are flagged amber, and the card as a whole goes red only
    when the medical is no longer valid for anything. Needs your date of birth
    and the exam date, both on the Profile page; BasicMed and unspecified
    classes fall back to a single entered expiration.
  - Flights whose tail has no profile are flagged; with no profiles at all,
    landings are counted together as before.
- **Route maps** — every flight has a detail page (click its date) with an
  OpenStreetMap/Leaflet map of the route flown and along-route distance.
  Airports resolve from a bundled OurAirports dataset
  (`lib/airports-data.json`); GPS fixes, VORs/NDBs, and airways resolve from
  FAA NASR data (`lib/navdata-data.json`, US only) — an airway between two
  waypoints (e.g. `SUNOL V334 SAC`) expands along its published fix sequence,
  so the map shows the actual doglegs, not a straight line. SIDs/STARs and
  unknown tokens are skipped gracefully. Lookups are offline; only the map
  tiles load from openstreetmap.org.
  - Rebuild data: `node scripts/build-airports.mjs airports.csv` (OurAirports)
    and `node scripts/build-navdata.mjs <dir with FIX.txt NAV.txt AWY.txt>`
    (FAA NASR 28-day subscription, individual FIX/NAV/AWY zips). NASR data is
    cycle-dated; refresh occasionally if fix/airway accuracy matters.
- **Estimated proficiency** — recency-scored areas (recent time, landings,
  instrument incl. approaches/holds, night) with a weighted overall score and
  the formula spelled out on the page. A self-assessment aid, not a legal
  determination.
- **Import/Export** — CSV import recognizes this app's own export plus common
  ForeFlight/LogTen column names (now including Holds), skips preamble sections
  and bad rows. Export downloads the full logbook as CSV (re-imports cleanly).
- **Airport lookup** (`/resources/airports`) — search the 24,048 airports in the contiguous
  US by identifier, name, or city. Each shows runway lengths/widths/surface and
  a schematic runway layout drawn from true headings, radio frequencies in
  chart-supplement order, fuel and repair services, a link to the official FAA
  airport diagram, and every published instrument approach linked to its plate.
  - Build it: `node scripts/build-airportdata.mjs [dir-with-APT.txt]`. Pulls
    OurAirports CSVs and the FAA d-TPP metafile (finding the current chart cycle
    itself); pass a directory containing NASR `APT.txt` to include fuel and
    repair data. Produces `data/airports.db` (~5 MB, gitignored). The section
    explains how to build it if the file is missing.
  - Fuel and repair come from the FAA airport record — the same data printed in
    the Chart Supplement — and each airport links to its own Chart Supplement
    volume PDF (the volume comes from the d-TPP metafile), which carries the
    full entry including FBOs and services.
- **Refresh All Data** (bottom of Resources) — one button
  rebuilds everything that expires: airport data (28-day chart cycle) and the
  FAR/AIM copy, with the aircraft registry as an opt-in extra since it's a much
  larger download. It runs detached so the request returns immediately, writing
  progress to `data/refresh-status.json`; the card shows each dataset's build
  date, contents, and a green/amber dot once it's past its shelf life. The
  airport build fetches its own NASR subscription, so no manual downloads.
  Equivalent CLI: `node scripts/refresh-data.mjs [--with-registry]`.
- **Flights list** — paginated at 15 per page, newest first, with the totals row
  covering the whole logbook rather than just the visible page.
- **Stats** — selectable time frame (past 30 days, past 180 days, past year,
  all time, or a custom range). The over-time chart re-buckets to suit the span
  — daily up to a month, weekly to four months, monthly to three years, yearly
  beyond — and thins its labels so a long range stays readable. Empty buckets
  are kept so gaps in flying show as gaps. Every other chart respects the same
  range.
- **Resources** (nav tab) — a hub linking to the three flight-planning tools —
  airport lookup, performance, and FAR/AIM search — each on its own page so no
  one page carries all of it. The Reference Data / Refresh All Data card sits at
  the bottom of the hub.
- **FAR / AIM search** (`/resources/regulations`) — a local, full-text searchable
  copy of 18 pilot-relevant 14 CFR parts (1,296 sections) and the AIM (432
  paragraphs), with FTS5 ranking, highlighted snippets, expandable full text, and
  a link to the official source. Typing a bare citation like `61.57` jumps
  straight to it.
- **Performance** (`/resources/performance`) — pressure altitude, ISA deviation
  and density altitude from the standard atmosphere, plus per-runway head/tail
  and crosswind components against the FAA's published true headings (which is
  also what a METAR wind is referenced to). Pick an airport and elevation,
  altimeter, temperature and wind prefill from the current observation.
  Takeoff and landing distance comes from one of two places, never from a guess:
  - **PA-28-181 (Piper Archer)** — tick the box and it reads the aircraft's own
    POH charts (Piper report VB-2960, Section 5, figures 5-7, 5-11, 5-41, 5-43).
    Those figures are graphical nomograms printed as scanned images, so the curve
    families were traced off the page; see `scripts/pohtrace/README.md` for the
    method and `lib/pa28-181-charts.ts` for the result. Walking the traced curves
    reproduces each figure's own printed worked example to within 2.1%. Inputs
    outside the printed envelope — over gross, past ISA+35, above the altitude or
    wind axis, or any tailwind — are refused with the reason rather than
    extrapolated.
  - **Anything else** — leave the box unticked and you copy the four AFM/POH
    values that bracket today's pressure altitude and temperature; it does the
    bilinear arithmetic and refuses to extrapolate outside the bracket.

  Either way your own AFM correction percentages (grass, slope, other) apply on
  top, and no safety factor is added. Rules live in `lib/performance.ts` and
  `lib/pohcharts.ts` as pure functions.
- **Weather** (with a looked-up airport) — current METAR and TAF from
  the Aviation Weather Center's public API, the only live data in the app. Shows
  the flight category (VFR/MVFR/IFR/LIFR in the conventional aviation colours),
  decoded wind, visibility, sky/ceiling, temp/dewpoint and altimeter, plus the
  raw text, which is authoritative. The TAF is broken out one change group per
  line (FM/BECMG/TEMPO/PROB), the way official products present it. Cached ~2 minutes. Every failure path —
  service down, no station, no TAF — degrades to a message rather than an error,
  and the observation age is shown so staleness is visible.
  - Build it: `node scripts/build-reference.mjs`. Pulls 14 CFR from the eCFR API
    (asking it which issue date is current — requesting today's 404s) and the
    AIM from faa.gov, into `data/reference.db` (~7.5 MB, gitignored). The page
    degrades to an explanation if the file is missing. Re-run periodically;
    both sources are amended regularly.
- **Profile pictures** — upload a PNG/JPEG/WebP/GIF up to 8 MB on your profile,
  then drag and zoom to frame it. The crop happens in the browser and only the
  chosen square is sent, so an 8 MB phone photo is stored as a ~50 KB 512x512
  JPEG. Stored as a BLOB in your own logbook file and served only to your own
  session (`/api/avatar` takes no user id, so one pilot can't fetch another's;
  `users.avatar_version` busts the browser cache on re-upload). Falls back to
  initials in your accent color.
- **Erase data** (Settings) — two irreversible options, each gated by typing
  your own name exactly: *erase logbook data* clears every flight, aircraft,
  certificate, medical, and endorsement while keeping the account and its
  settings; *delete account* does all that and removes the account too, then
  signs you out. Both show a live count of what will go and link to a CSV
  export first, and both delete only the signed-in pilot's rows.

## Tech

Next.js 15 (App Router, server actions), TypeScript, better-sqlite3, no CSS
framework. Database schema is created automatically on first run.

## Tests

```bash
node scripts/test-csv.mts          # CSV parser + round-trip tests
node scripts/test-csv.mts --seed   # also seeds sample flights for testpilot@example.com
node scripts/test-currency.mts     # 61.56 reset rules + 61.23(d) medical durations
node scripts/test-username.mts     # name shape rules + profanity/slur screen
node scripts/test-registry.mts     # tail-number autofill (skips live checks if unbuilt)
node scripts/test-performance.mts  # pressure/density altitude, wind components, POH interpolation
node scripts/test-planner.mts      # the dashboard "What do I need?" action list
node scripts/test-pohcharts.mts    # PA-28-181 chart digitisation vs the POH's printed examples
```

## Schema changes

`lib/db.ts` creates missing tables and runs additive column migrations on every
start, so an existing `data/logbook.db` upgrades in place — no manual steps. The
one data migration (moving the old Settings medical/flight-review dates into the
profile tables) is guarded by a row in `schema_meta`, so deleting a migrated
record won't resurrect it.

## Notes

- Currency logic is a convenience aid, not a substitute for the regulations —
  61.57 currency is per category/class and this app counts all landings
  together. Verify against your actual logbook before carrying passengers.
- `data/` holds the SQLite database and the session-signing secret; back it up,
  don't commit it.

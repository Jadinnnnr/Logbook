"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, User, Flight, userIdWithName } from "./db";
import { nameError } from "./username";
import { THEMES, ACCENTS, CUSTOM_ACCENT } from "./theme";
import { isHexColor } from "./color";
import { refreshRunning } from "./datastatus";
import { spawn } from "child_process";
import fsSync from "fs";
import path from "path";
import { createSession, destroySession, requireUser } from "./auth";
import { parseImport } from "./csv";
import { lookupTailNumber, type RegistryAircraft } from "./registry";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function num(fd: FormData, key: string): number {
  const n = parseFloat(str(fd, key));
  return isNaN(n) || n < 0 ? 0 : n;
}

function int(fd: FormData, key: string): number {
  const n = parseInt(str(fd, key), 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

export async function register(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const name = str(formData, "name");
  const dob = str(formData, "date_of_birth");
  const password = formData.get("password");
  const confirm = formData.get("confirm_password");

  // Echo back what they typed so a rejected signup doesn't wipe the form.
  const back = (message: string) => {
    redirect(`/register?${new URLSearchParams({ error: message, name, email, dob })}`);
  };

  if (!email || !name) back("Name and email are both required.");
  const badName = nameError(name);
  if (badName) back(badName);
  if (typeof password !== "string" || password.length < 8) {
    back("Password must be at least 8 characters.");
  }
  if (password !== confirm) back("The two passwords don't match.");
  if (!dob) back("Date of birth is required.");

  const db = getDb();
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    back("An account with that email already exists.");
  }
  if (userIdWithName(name)) back("That name is already taken — please choose another.");

  const hash = bcrypt.hashSync(password as string, 10);
  const info = db
    .prepare(
      "INSERT INTO users (email, username, name, password_hash, date_of_birth) VALUES (?, ?, ?, ?, ?)"
    )
    .run(email, name, name, hash, dob);
  await createSession(Number(info.lastInsertRowid));
  redirect("/");
}

export async function login(formData: FormData) {
  // One field accepts either identifier; email is stored lowercased, usernames
  // are compared case-insensitively.
  const identifier = str(formData, "identifier");
  const password = formData.get("password");
  const user = getDb()
    .prepare("SELECT * FROM users WHERE email = ? OR username = ? COLLATE NOCASE")
    .get(identifier.toLowerCase(), identifier) as User | undefined;
  if (!user || typeof password !== "string" || !bcrypt.compareSync(password, user.password_hash)) {
    const q = new URLSearchParams({
      error: "That username or email and password don't match.",
      identifier,
    });
    redirect(`/login?${q}`);
  }
  await createSession(user!.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

const FLIGHT_FIELDS = `date, aircraft_type, tail_number, from_airport, to_airport, route,
  total_time, pic, sic, dual_received, solo, night, cross_country,
  actual_instrument, simulated_instrument, day_landings, night_landings,
  night_full_stop_landings, approaches, holds, remarks`;

/**
 * Which aircraft a submitted flight refers to. If a profile was chosen its
 * tail/type override the free-text fields (which the form disables when a
 * profile is selected).
 */
function resolveAircraft(fd: FormData, userId: number): { tail: string; type: string } {
  let tail = str(fd, "tail_number").toUpperCase();
  let type = str(fd, "aircraft_type").toUpperCase();
  const aircraftId = str(fd, "aircraft_id");
  if (aircraftId) {
    const a = getDb()
      .prepare("SELECT * FROM aircraft WHERE id = ? AND user_id = ?")
      .get(Number(aircraftId), userId) as { tail_number: string; aircraft_type: string } | undefined;
    if (a) {
      tail = a.tail_number.toUpperCase();
      type = a.aircraft_type.toUpperCase();
    }
  }
  return { tail, type };
}

/**
 * Give a just-flown tail number a profile in the fleet if it hasn't got one,
 * prefilled from the FAA registry where that database is present. Returns the
 * tail when a profile was created, so the caller can say so.
 *
 * Best effort by design: the flight is already written by the time this runs,
 * and no problem building a fleet entry should surface to the pilot as a
 * failure to log the flight.
 */
function ensureAircraftProfile(userId: number, tail: string, type: string): string | null {
  if (!tail) return null;
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM aircraft WHERE user_id = ? AND tail_number = ? COLLATE NOCASE")
    .get(userId, tail);
  if (existing) return null;

  let reg: RegistryAircraft | null = null;
  try {
    reg = lookupTailNumber(tail);
  } catch {
    // No registry database, or it's unreadable — a bare profile still beats none.
  }

  try {
    db.prepare(
      `INSERT OR IGNORE INTO aircraft
         (user_id, tail_number, aircraft_type, make_model, category_class, is_high_performance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      tail,
      // What the pilot typed wins; the registry's guess is the fallback.
      type || reg?.typeCode || "",
      reg?.makeModel ?? "",
      reg?.categoryClass || "ASEL",
      reg?.highPerformance ? 1 : 0,
      // The 61.31 flags other than horsepower can't be inferred from the
      // registry, so say where this came from and that it wants a look.
      "Added automatically when a flight was logged in it. Check the category/class and the complex, TAA, and tailwheel flags."
    );
  } catch {
    return null;
  }
  return tail;
}

function flightValues(fd: FormData, aircraft: { tail: string; type: string }): (string | number)[] {
  const { tail, type } = aircraft;
  return [
    str(fd, "date"),
    type,
    tail,
    str(fd, "from_airport").toUpperCase(),
    str(fd, "to_airport").toUpperCase(),
    str(fd, "route").toUpperCase(),
    num(fd, "total_time"),
    num(fd, "pic"),
    num(fd, "sic"),
    num(fd, "dual_received"),
    num(fd, "solo"),
    num(fd, "night"),
    num(fd, "cross_country"),
    num(fd, "actual_instrument"),
    num(fd, "simulated_instrument"),
    int(fd, "day_landings"),
    int(fd, "night_landings"),
    int(fd, "night_full_stop_landings"),
    int(fd, "approaches"),
    int(fd, "holds"),
    str(fd, "remarks"),
  ];
}

export async function saveFlight(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  if (!str(formData, "date")) {
    redirect((id ? `/flights/${id}/edit` : "/flights/new") + "?error=" + encodeURIComponent("Date is required."));
  }
  const db = getDb();
  const aircraft = resolveAircraft(formData, user.id);
  const values = flightValues(formData, aircraft);
  if (id) {
    const owned = db.prepare("SELECT id FROM flights WHERE id = ? AND user_id = ?").get(Number(id), user.id);
    if (owned) {
      const sets = FLIGHT_FIELDS.split(",").map((f) => `${f.trim()} = ?`).join(", ");
      db.prepare(`UPDATE flights SET ${sets} WHERE id = ? AND user_id = ?`).run(...values, Number(id), user.id);
    }
  } else {
    const placeholders = FLIGHT_FIELDS.split(",").map(() => "?").join(", ");
    db.prepare(`INSERT INTO flights (user_id, ${FLIGHT_FIELDS}) VALUES (?, ${placeholders})`).run(user.id, ...values);
  }

  // Flying a tail number is the moment we learn the aircraft exists, so adopt
  // it into the fleet rather than making the pilot go and add it by hand.
  const added = ensureAircraftProfile(user.id, aircraft.tail, aircraft.type);
  if (added) revalidatePath("/aircraft");

  revalidatePath("/flights");
  redirect(added ? `/flights?added=${encodeURIComponent(added)}` : "/flights");
}

export async function deleteFlight(formData: FormData) {
  const user = await requireUser();
  const id = Number(str(formData, "id"));
  getDb().prepare("DELETE FROM flights WHERE id = ? AND user_id = ?").run(id, user.id);
  revalidatePath("/flights");
  redirect("/flights");
}

export async function saveAircraft(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const tail = str(formData, "tail_number").toUpperCase();
  const type = str(formData, "aircraft_type").toUpperCase();
  const makeModel = str(formData, "make_model");
  const categoryClass = str(formData, "category_class") || "ASEL";
  const notes = str(formData, "notes");
  if (!tail) {
    redirect("/aircraft?error=" + encodeURIComponent("Tail number is required."));
  }
  const db = getDb();
  const flags = ["is_complex", "is_high_performance", "is_taa", "is_tailwheel"].map((f) =>
    formData.get(f) ? 1 : 0
  );
  try {
    if (id) {
      db.prepare(
        "UPDATE aircraft SET tail_number = ?, aircraft_type = ?, make_model = ?, category_class = ?, is_complex = ?, is_high_performance = ?, is_taa = ?, is_tailwheel = ?, notes = ? WHERE id = ? AND user_id = ?"
      ).run(tail, type, makeModel, categoryClass, ...flags, notes, Number(id), user.id);
    } else {
      db.prepare(
        "INSERT INTO aircraft (user_id, tail_number, aircraft_type, make_model, category_class, is_complex, is_high_performance, is_taa, is_tailwheel, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(user.id, tail, type, makeModel, categoryClass, ...flags, notes);
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      redirect("/aircraft?error=" + encodeURIComponent(`You already have a profile for ${tail}.`));
    }
    throw e;
  }
  revalidatePath("/aircraft");
  redirect("/aircraft");
}

export async function deleteAircraft(formData: FormData) {
  const user = await requireUser();
  const id = Number(str(formData, "id"));
  getDb().prepare("DELETE FROM aircraft WHERE id = ? AND user_id = ?").run(id, user.id);
  revalidatePath("/aircraft");
  redirect("/aircraft");
}

export async function saveSettings(formData: FormData) {
  const user = await requireUser();
  const name = str(formData, "name") || user.username;
  if (name.toLowerCase() !== user.username.toLowerCase()) {
    const badName = nameError(name);
    if (badName) redirect("/settings?error=" + encodeURIComponent(badName));
    if (userIdWithName(name, user.id)) {
      redirect("/settings?error=" + encodeURIComponent("That name is already taken — please choose another."));
    }
  }
  const theme = THEMES.some(([v]) => v === str(formData, "theme")) ? str(formData, "theme") : user.theme;
  const requested = str(formData, "accent");
  const accent =
    ACCENTS.some(([v]) => v === requested) || requested === CUSTOM_ACCENT ? requested : user.accent;
  const requestedHex = str(formData, "accent_custom").toLowerCase();
  const customHex = isHexColor(requestedHex) ? requestedHex : user.accent_custom;
  getDb()
    .prepare("UPDATE users SET username = ?, name = ?, theme = ?, accent = ?, accent_custom = ? WHERE id = ?")
    .run(name, name, theme, accent, customHex, user.id);
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

/**
 * Kick off a rebuild of the datasets that expire (airport charts, FAR/AIM).
 * Detached so the request returns immediately — a full refresh takes minutes —
 * with progress written to data/refresh-status.json for the dashboard to read.
 */
export async function changePassword(formData: FormData) {
  const user = await requireUser();
  const current = formData.get("current_password");
  const next = formData.get("new_password");
  const confirm = formData.get("confirm_password");
  const fail = (message: string) => {
    redirect("/settings?error=" + encodeURIComponent(message));
  };

  if (typeof current !== "string" || !bcrypt.compareSync(current, user.password_hash)) {
    fail("Your current password isn't right.");
  }
  if (typeof next !== "string" || next.length < 8) {
    fail("Your new password must be at least 8 characters.");
  }
  if (next !== confirm) fail("The two new passwords don't match.");
  if (bcrypt.compareSync(next as string, user.password_hash)) {
    fail("That's already your password.");
  }

  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(next as string, 10),
    user.id
  );

  // A password change is how someone locks out a session they no longer trust,
  // so drop every other one. createSession re-issues this browser's cookie, so
  // the pilot doing the changing stays signed in.
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
  await createSession(user.id);

  redirect("/settings?password=1");
}

export async function refreshData(formData: FormData) {
  await requireUser();
  if (refreshRunning()) redirect("/resources?refresh=already");

  const args = ["scripts/refresh-data.mjs"];
  if (formData.get("with_registry")) args.push("--with-registry");

  const log = fsSync.openSync(path.join(process.cwd(), "data", "refresh.log"), "a");
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  revalidatePath("/resources");
  redirect("/resources?refresh=started");
}

// ---------- Destructive account actions ----------

/** Everything owned by a pilot, children first so it works with or without cascade. */
const OWNED_TABLES = ["flights", "aircraft", "certificates", "medicals", "endorsements"];

/** Both erasures require the pilot to type their own name exactly. */
function assertConfirmed(formData: FormData, user: User, what: string) {
  if (str(formData, "confirm") !== user.username) {
    redirect(
      "/settings?error=" +
        encodeURIComponent(`Type your name exactly — "${user.username}" — to confirm ${what}.`)
    );
  }
}

export async function eraseLogbookData(formData: FormData) {
  const user = await requireUser();
  assertConfirmed(formData, user, "erasing your logbook");
  const db = getDb();
  db.transaction(() => {
    for (const table of OWNED_TABLES) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(user.id);
    }
  })();
  revalidatePath("/", "layout");
  redirect("/settings?erased=1");
}

export async function deleteAccount(formData: FormData) {
  const user = await requireUser();
  assertConfirmed(formData, user, "deleting your account");
  const db = getDb();
  db.transaction(() => {
    for (const table of OWNED_TABLES) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(user.id);
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  })();
  await destroySession();
  redirect("/register?deleted=1");
}

// ---------- Profile records ----------

export async function saveCertificate(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!name) {
    redirect("/profile?error=" + encodeURIComponent("Certificate or rating name is required."));
  }
  const vals = [
    str(formData, "kind") === "rating" ? "rating" : "certificate",
    name,
    str(formData, "number"),
    str(formData, "issued_date"),
    str(formData, "expires_date"),
    formData.get("resets_flight_review") ? 1 : 0,
    str(formData, "notes"),
  ];
  const db = getDb();
  if (id) {
    db.prepare(
      "UPDATE certificates SET kind = ?, name = ?, number = ?, issued_date = ?, expires_date = ?, resets_flight_review = ?, notes = ? WHERE id = ? AND user_id = ?"
    ).run(...vals, Number(id), user.id);
  } else {
    db.prepare(
      "INSERT INTO certificates (kind, name, number, issued_date, expires_date, resets_flight_review, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(...vals, user.id);
  }
  revalidatePath("/profile");
  revalidatePath("/");
  redirect("/profile");
}

export async function savePilotDetails(formData: FormData) {
  const user = await requireUser();
  const dob = str(formData, "date_of_birth") || null;
  getDb().prepare("UPDATE users SET date_of_birth = ? WHERE id = ?").run(dob, user.id);
  revalidatePath("/profile");
  revalidatePath("/");
  redirect("/profile?saved=1");
}

const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** The browser crops before uploading, so what arrives is normally ~60 KB;
 *  this is the backstop for a direct post or a browser without canvas. */
const AVATAR_MAX_BYTES = 8 * 1024 * 1024;

export async function saveAvatar(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("avatar");
  const fail = (m: string) => redirect("/profile?error=" + encodeURIComponent(m));

  if (!(file instanceof File) || file.size === 0) fail("Choose an image to upload.");
  const image = file as File;
  if (!AVATAR_TYPES.includes(image.type)) {
    fail("Profile picture must be a PNG, JPEG, WebP, or GIF.");
  }
  if (image.size > AVATAR_MAX_BYTES) {
    fail(`That image is ${(image.size / 1e6).toFixed(1)} MB — the limit is 8 MB.`);
  }
  const bytes = Buffer.from(await image.arrayBuffer());
  // The picture is served from a fixed URL, so the version is what tells the
  // browser this is a different image.
  getDb()
    .prepare("UPDATE users SET avatar = ?, avatar_type = ?, avatar_version = ? WHERE id = ?")
    .run(bytes, image.type, String(Date.now()), user.id);
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

export async function removeAvatar() {
  const user = await requireUser();
  getDb()
    .prepare("UPDATE users SET avatar = NULL, avatar_type = NULL, avatar_version = NULL WHERE id = ?")
    .run(user.id);
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

export async function saveMedical(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const expires = str(formData, "expires_date");
  const examDate = str(formData, "exam_date");
  const medicalClass = str(formData, "medical_class") || "Unspecified";
  // Classes with a 61.23(d) tier ladder can derive every expiration from the
  // exam date; the rest need an explicit one.
  const tiered = ["First class", "Second class", "Third class"].includes(medicalClass);
  if (!examDate && !expires) {
    redirect("/profile?error=" + encodeURIComponent("Enter the exam date, or an expiration date."));
  }
  if (!tiered && !expires) {
    redirect(
      "/profile?error=" +
        encodeURIComponent(`${medicalClass} has no 61.23(d) tiers — enter an expiration date.`)
    );
  }
  const vals = [
    medicalClass,
    examDate,
    expires,
    str(formData, "examiner"),
    str(formData, "notes"),
  ];
  const db = getDb();
  if (id) {
    db.prepare(
      "UPDATE medicals SET medical_class = ?, exam_date = ?, expires_date = ?, examiner = ?, notes = ? WHERE id = ? AND user_id = ?"
    ).run(...vals, Number(id), user.id);
  } else {
    db.prepare(
      "INSERT INTO medicals (medical_class, exam_date, expires_date, examiner, notes, user_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(...vals, user.id);
  }
  revalidatePath("/profile");
  revalidatePath("/");
  redirect("/profile");
}

export async function saveEndorsement(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const type = str(formData, "endorsement_type");
  const date = str(formData, "date");
  if (!type || !date) {
    redirect("/profile?error=" + encodeURIComponent("Endorsement type and date are required."));
  }
  const vals = [
    type,
    date,
    str(formData, "expires_date"),
    str(formData, "instructor_name"),
    str(formData, "instructor_cert"),
    str(formData, "notes"),
  ];
  const db = getDb();
  if (id) {
    db.prepare(
      "UPDATE endorsements SET endorsement_type = ?, date = ?, expires_date = ?, instructor_name = ?, instructor_cert = ?, notes = ? WHERE id = ? AND user_id = ?"
    ).run(...vals, Number(id), user.id);
  } else {
    db.prepare(
      "INSERT INTO endorsements (endorsement_type, date, expires_date, instructor_name, instructor_cert, notes, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(...vals, user.id);
  }
  revalidatePath("/profile");
  revalidatePath("/");
  redirect("/profile");
}

/** Delete a profile record. `table` is validated against a fixed allowlist. */
export async function deleteProfileRecord(formData: FormData) {
  const user = await requireUser();
  const table = str(formData, "table");
  const id = Number(str(formData, "id"));
  if (!["certificates", "medicals", "endorsements"].includes(table) || !id) {
    redirect("/profile");
  }
  getDb().prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(id, user.id);
  revalidatePath("/profile");
  revalidatePath("/");
  redirect("/profile");
}

export async function importCsv(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/import-export?error=" + encodeURIComponent("Choose a CSV file to import."));
  }
  const text = await (file as File).text();
  const result = parseImport(text);
  if (result.flights.length === 0) {
    redirect(
      "/import-export?error=" +
        encodeURIComponent("No flights found. The CSV needs a header row with at least Date plus two recognized columns.")
    );
  }
  const db = getDb();
  const cols = FLIGHT_FIELDS.split(",").map((f) => f.trim());
  const placeholders = cols.map(() => "?").join(", ");
  const insert = db.prepare(`INSERT INTO flights (user_id, ${FLIGHT_FIELDS}) VALUES (?, ${placeholders})`);
  const insertAll = db.transaction((flights: Partial<Flight>[]) => {
    for (const f of flights) {
      insert.run(
        user.id,
        ...cols.map((c) => {
          const v = (f as Record<string, unknown>)[c];
          if (typeof v === "number") return v;
          if (typeof v === "string") return v;
          return c === "remarks" || c.endsWith("_airport") || c === "route" || c === "aircraft_type" || c === "tail_number" ? "" : 0;
        })
      );
    }
  });
  insertAll(result.flights);
  revalidatePath("/flights");
  redirect(
    "/import-export?imported=" +
      result.flights.length +
      (result.skipped ? "&skipped=" + result.skipped : "")
  );
}

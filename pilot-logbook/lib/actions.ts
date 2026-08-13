"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, User, Flight, userIdWithName, writeArchive } from "./db";
import { nameError } from "./username";
import { THEMES, ACCENTS, CUSTOM_ACCENT, FONTS } from "./theme";
import { isHexColor } from "./color";
import { refreshRunning } from "./datastatus";
import { spawn } from "child_process";
import fsSync from "fs";
import path from "path";
import { createSession, destroySession, requireUser, destroyOtherSessions } from "./auth";
import { parseImport } from "./csv";
import type { BackupArchive } from "./backup";
import { BackupError, BACKUP_VERSION, decodeBackup, recordCount } from "./backup";
import { devAccounts } from "./devaccounts";
import type { Profile as WBProfile } from "./weightbalance";
import { isUsable } from "./weightbalance";
import { randomUUID } from "crypto";

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

function flightValues(fd: FormData, userId: number): (string | number)[] {
  // If an aircraft profile was chosen, its tail/type override the free-text
  // fields (which the form disables when a profile is selected).
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
  const values = flightValues(formData, user.id);
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
  revalidatePath("/flights");
  redirect("/flights");
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
  const font = FONTS.some(([v]) => v === str(formData, "font")) ? str(formData, "font") : user.font;
  getDb()
    .prepare(
      "UPDATE users SET username = ?, name = ?, theme = ?, accent = ?, accent_custom = ?, font = ? WHERE id = ?"
    )
    .run(name, name, theme, accent, customHex, font, user.id);
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

/**
 * Kick off a rebuild of the datasets that expire (airport charts, FAR/AIM).
 * Detached so the request returns immediately — a full refresh takes minutes —
 * with progress written to data/refresh-status.json for the dashboard to read.
 */
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
  // The child holds its own duplicate of the descriptor, so the parent's copy
  // is dead weight. Left open, the server leaks one per refresh until it hits
  // the process limit — slowly, but a long-running server has time.
  fsSync.closeSync(log);
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

// ---------- Bookmarks ----------

/**
 * Saves a bookmark, or renames and refiles one already saved.
 *
 * An empty name clears a custom one rather than storing whitespace, so
 * submitting with the field emptied is how you go back to the plain citation.
 * `groups` is the complete membership afterwards; omitting the field entirely
 * leaves existing membership alone, which is what a bare toggle wants.
 */
export async function saveBookmark(formData: FormData) {
  const user = await requireUser();
  const source = str(formData, "source");
  const citation = str(formData, "citation");
  if (!source || !citation) return;

  const db = getDb();
  db.prepare(
    `INSERT INTO bookmarks (user_id, source, citation, name) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, source, citation) DO UPDATE SET name = excluded.name`
  ).run(user.id, source, citation, str(formData, "name"));

  if (formData.has("groups")) {
    const row = db
      .prepare("SELECT id FROM bookmarks WHERE user_id = ? AND source = ? AND citation = ?")
      .get(user.id, source, citation) as { id: number } | undefined;
    if (row) {
      // Only this pilot's groups can be joined to, whatever ids were posted.
      const own = new Set(
        (db.prepare("SELECT id FROM bookmark_groups WHERE user_id = ?").all(user.id) as {
          id: number;
        }[]).map((g) => g.id)
      );
      const wanted = formData
        .getAll("groups")
        .map((v) => parseInt(String(v), 10))
        .filter((id) => own.has(id));
      db.transaction(() => {
        db.prepare("DELETE FROM bookmark_group_members WHERE bookmark_id = ?").run(row.id);
        const ins = db.prepare(
          "INSERT OR IGNORE INTO bookmark_group_members (group_id, bookmark_id) VALUES (?, ?)"
        );
        for (const g of wanted) ins.run(g, row.id);
      })();
    }
  }
  revalidatePath("/resources/regulations");
}

export async function removeBookmark(formData: FormData) {
  const user = await requireUser();
  // The member rows go with it: this connection runs with foreign_keys ON, so
  // the ON DELETE CASCADE on bookmark_group_members actually fires.
  getDb()
    .prepare("DELETE FROM bookmarks WHERE user_id = ? AND source = ? AND citation = ?")
    .run(user.id, str(formData, "source"), str(formData, "citation"));
  revalidatePath("/resources/regulations");
}

/** Creates a group, or does nothing when the pilot already has that name. */
export async function createBookmarkGroup(formData: FormData) {
  const user = await requireUser();
  const name = str(formData, "name");
  if (!name) return;
  getDb()
    .prepare("INSERT OR IGNORE INTO bookmark_groups (user_id, name) VALUES (?, ?)")
    .run(user.id, name);
  revalidatePath("/resources/regulations");
}

export async function renameBookmarkGroup(formData: FormData) {
  const user = await requireUser();
  const id = int(formData, "id");
  const name = str(formData, "name");
  if (!id || !name) return;
  // A collision would violate the unique index and throw the rename away, so
  // refuse it here where the caller can still see nothing happened.
  const clash = getDb()
    .prepare("SELECT id FROM bookmark_groups WHERE user_id = ? AND name = ? AND id != ?")
    .get(user.id, name, id);
  if (clash) return;
  getDb()
    .prepare("UPDATE bookmark_groups SET name = ? WHERE id = ? AND user_id = ?")
    .run(name, id, user.id);
  revalidatePath("/resources/regulations");
}

/**
 * Deletes the group, not the bookmarks in it — a group is a view onto them,
 * not a container that owns them.
 */
export async function deleteBookmarkGroup(formData: FormData) {
  const user = await requireUser();
  getDb()
    .prepare("DELETE FROM bookmark_groups WHERE id = ? AND user_id = ?")
    .run(int(formData, "id"), user.id);
  revalidatePath("/resources/regulations");
}

// ---------- Backup and restore ----------

export async function restoreBackup(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/import-export?restoreError=" + encodeURIComponent("Choose a backup file first."));
  }
  let archive: BackupArchive;
  try {
    archive = decodeBackup(await (file as File).text());
  } catch (e) {
    const message = e instanceof BackupError ? e.message : "That file couldn't be read.";
    redirect("/import-export?restoreError=" + encodeURIComponent(message));
  }
  writeArchive(user.id, archive!);
  revalidatePath("/");
  redirect("/import-export?restored=" + recordCount(archive!));
}

// ---------- Developer accounts ----------

/**
 * Deliberately in the clear. Anyone who can read the source can read it, so
 * this is a "not by accident" gate, not a real lock — the page itself says so.
 */
const DEV_PASSWORD = "AllWhiteGucciSuit";

export async function loadDevAccount(formData: FormData) {
  const user = await requireUser();
  if (str(formData, "password") !== DEV_PASSWORD) {
    redirect("/developer?error=" + encodeURIComponent("Wrong password."));
  }
  const wanted = str(formData, "account");
  const account = devAccounts().find((a) => a.name === wanted);
  if (!account) redirect("/developer?error=" + encodeURIComponent("No such account."));

  // Reuse the restore path, so a fixture and a backup can't diverge in how they
  // land in the database.
  writeArchive(user.id, {
    formatVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    pilot: { name: account!.name, dateOfBirth: account!.dateOfBirth || null },
    flights: account!.flights as unknown as Record<string, unknown>[],
    aircraft: account!.aircraft as unknown as Record<string, unknown>[],
    certificates: account!.certificates as unknown as Record<string, unknown>[],
    medicals: account!.medicals as unknown as Record<string, unknown>[],
    endorsements: account!.endorsements as unknown as Record<string, unknown>[],
    bookmarkGroups: [],
    bookmarks: [],
  });
  revalidatePath("/");
  redirect("/developer?loaded=" + encodeURIComponent(account!.name));
}

// ---------- Weight-and-balance profiles ----------

/**
 * Saves a custom profile, or updates one already saved.
 *
 * Built-ins are refused: they're code, and a stored copy would silently shadow
 * a corrected one on the next deploy. The id is namespaced per user on insert,
 * so one pilot can't overwrite another's row by posting its id.
 */
export async function saveToldProfile(formData: FormData) {
  const user = await requireUser();
  const raw = str(formData, "profile");
  if (!raw) return;

  let profile: WBProfile;
  try {
    profile = JSON.parse(raw) as WBProfile;
  } catch {
    redirect("/resources/told?error=" + encodeURIComponent("That profile couldn't be read."));
  }
  if (profile!.isBuiltIn || !isUsable(profile!)) {
    redirect(
      "/resources/told?error=" +
        encodeURIComponent("A profile needs a name, a gross weight, and a fuel capacity.")
    );
  }

  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM told_profiles WHERE id = ? AND user_id = ?")
    .get(profile!.id, user.id);
  if (existing) {
    db.prepare("UPDATE told_profiles SET json = ? WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(profile), profile!.id, user.id);
  } else {
    // A fresh id, so a posted one can't collide with somebody else's row.
    profile!.id = `user.${user.id}.${randomUUID()}`;
    db.prepare("INSERT INTO told_profiles (id, user_id, json) VALUES (?, ?, ?)")
      .run(profile!.id, user.id, JSON.stringify(profile));
  }
  revalidatePath("/resources/told");
  redirect("/resources/told?profile=" + encodeURIComponent(profile!.id));
}

export async function deleteToldProfile(formData: FormData) {
  const user = await requireUser();
  getDb()
    .prepare("DELETE FROM told_profiles WHERE id = ? AND user_id = ?")
    .run(str(formData, "id"), user.id);
  revalidatePath("/resources/told");
  redirect("/resources/told");
}

/**
 * Changes the signed-in pilot's password.
 *
 * Every other session is dropped. A password change is usually a response to
 * "somebody else may have this" — leaving their browser signed in would defeat
 * the point. This session survives, because signing you out of the page you're
 * standing on to tell you it worked is its own small cruelty.
 */
export async function changePassword(formData: FormData) {
  const user = await requireUser();
  const current = formData.get("current_password");
  const next = formData.get("new_password");
  const confirm = formData.get("confirm_password");

  const back = (message: string): never => {
    redirect("/settings?error=" + encodeURIComponent(message));
  };

  if (typeof current !== "string" || !bcrypt.compareSync(current, user.password_hash)) {
    back("That isn't your current password.");
  }
  if (typeof next !== "string" || next.length < 8) {
    back("The new password must be at least 8 characters.");
  }
  if (next !== confirm) {
    back("The new passwords don't match.");
  }
  if (typeof current === "string" && next === current) {
    back("That's the password you already have.");
  }

  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(bcrypt.hashSync(next as string, 10), user.id);

  // Everything but the session doing the changing.
  await destroyOtherSessions(user.id);

  redirect("/settings?password=1");
}

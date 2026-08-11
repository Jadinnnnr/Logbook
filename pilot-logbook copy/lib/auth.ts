import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDb, User } from "./db";
import { IDLE_MS } from "./session-timing";

const COOKIE_NAME = "logbook_session";

/**
 * Outer bound on how long the browser keeps the cookie. This is only a backstop
 * for cookies the server has already forgotten — the sessions table is what
 * actually decides whether a token is still good.
 */
const COOKIE_DAYS = 30;

let cachedSecret: Buffer | null = null;

function getSecret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const secretPath = path.join(dataDir, "session-secret");
  if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  cachedSecret = Buffer.from(fs.readFileSync(secretPath, "utf8").trim(), "hex");
  return cachedSecret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export async function createSession(userId: number) {
  const db = getDb();
  // Opportunistic sweep, so abandoned sessions don't accumulate forever.
  db.prepare("DELETE FROM sessions WHERE last_seen < ?").run(Date.now() - IDLE_MS);

  const id = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (id, user_id, last_seen) VALUES (?, ?, ?)").run(id, userId, Date.now());

  const store = await cookies();
  store.set(COOKIE_NAME, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000),
  });
}

/** The session id in a cookie, or null if it is malformed or not ours. */
function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null; // includes pre-idle-timeout tokens
  const [id, sig] = parts;
  const expected = sign(id);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return id;
}

export async function destroySession() {
  const store = await cookies();
  const id = readToken(store.get(COOKIE_NAME)?.value);
  if (id) getDb().prepare("DELETE FROM sessions WHERE id = ?").run(id);
  store.delete(COOKIE_NAME);
}

/**
 * The still-valid session named by the request's cookie, or null. Reaps the row
 * on the way past if it has gone stale. Does not slide the window — callers
 * decide whether the request they are serving counts as activity.
 */
async function liveSession(): Promise<{ id: string; user_id: number; last_seen: number } | null> {
  const store = await cookies();
  const id = readToken(store.get(COOKIE_NAME)?.value);
  if (!id) return null;

  const db = getDb();
  const row = db
    .prepare("SELECT user_id, last_seen FROM sessions WHERE id = ?")
    .get(id) as { user_id: number; last_seen: number } | undefined;
  if (!row) return null;

  if (Date.now() - row.last_seen > IDLE_MS) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  return { id, ...row };
}

/** Push the idle window out to a full IDLE_MS from now; returns the new deadline. */
function slide(id: string): number {
  const now = Date.now();
  getDb().prepare("UPDATE sessions SET last_seen = ? WHERE id = ?").run(now, id);
  return now + IDLE_MS;
}

export async function getSessionUser(): Promise<User | null> {
  const session = await liveSession();
  if (!session) return null;

  // Sliding the window here, on a plain read, is deliberate: nearly every page
  // view is a Server Component render, and Next forbids setting cookies during
  // one. Keeping the clock in the database means ordinary browsing counts as
  // activity — a cookie-based expiry could only be refreshed on form posts.
  slide(session.id);

  const user = getDb().prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) as User | undefined;
  return user ?? null;
}

/**
 * When the current session would lapse, without counting this call as activity.
 * The warning dialog polls it, so it must never extend what it is measuring.
 */
export async function sessionDeadline(): Promise<number | null> {
  const session = await liveSession();
  return session ? session.last_seen + IDLE_MS : null;
}

/** Answer "stay signed in": restart the idle clock. Returns the new deadline. */
export async function keepSessionAlive(): Promise<number | null> {
  const session = await liveSession();
  return session ? slide(session.id) : null;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Signs out every other browser for this user, keeping the one making the
 * request.
 *
 * Lives here rather than in actions.ts because it needs the cookie name and the
 * token format, and both are this module's business — a caller that had to
 * unpack `id.signature` itself would be a second place to keep that in step.
 */
export async function destroyOtherSessions(userId: number) {
  const store = await cookies();
  const keep = readToken(store.get(COOKIE_NAME)?.value) ?? "";
  getDb().prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(userId, keep);
}

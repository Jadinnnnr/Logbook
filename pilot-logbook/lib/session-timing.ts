/**
 * Idle-session timings, shared by the server (which enforces them) and the
 * warning dialog (which counts down to them). Deliberately free of "server-only"
 * and of any database import so a client component can read the same numbers.
 *
 * The sequence: 14 quiet minutes, then a dialog offering one minute to stay
 * signed in. Ignore it and the session is gone at the 15-minute mark.
 */

/** Quiet time before the pilot is warned. */
export const WARN_AFTER_MINUTES = 14;

/** How long the warning dialog waits for an answer. */
export const COUNTDOWN_SECONDS = 60;

export const WARN_AFTER_MS = WARN_AFTER_MINUTES * 60 * 1000;
export const COUNTDOWN_MS = COUNTDOWN_SECONDS * 1000;

/** Total idle life of a session — the server's cutoff. */
export const IDLE_MS = WARN_AFTER_MS + COUNTDOWN_MS;

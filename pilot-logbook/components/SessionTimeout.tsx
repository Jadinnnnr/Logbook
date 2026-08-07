"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { COUNTDOWN_MS, COUNTDOWN_SECONDS } from "@/lib/session-timing";

/**
 * Warns before an idle session lapses and offers to keep it.
 *
 * The server owns the clock — this only reads it. `expiresAt` is an absolute
 * time fetched from /api/session, re-read after every navigation because page
 * renders slide the window server-side. The dialog appears when less than the
 * countdown remains, and at zero the session is dropped for real rather than
 * merely hidden, so a stopped JS timer can never leave someone signed in.
 */
export default function SessionTimeout() {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const pathname = usePathname();
  // Guards against the expiry running twice if a tick lands mid-redirect.
  const expiring = useRef(false);

  const sync = useCallback(async (method: "GET" | "POST") => {
    try {
      const res = await fetch("/api/session", { method, cache: "no-store" });
      if (!res.ok) {
        setExpiresAt(null);
        return;
      }
      const body = (await res.json()) as { signedIn: boolean; expiresAt?: number };
      setExpiresAt(body.signedIn && body.expiresAt ? body.expiresAt : null);
    } catch {
      // Offline or the server went away — leave the last known deadline alone
      // rather than inventing one.
    }
  }, []);

  // Re-read the deadline on arrival and after each navigation, since rendering
  // a page already pushed the window forward on the server.
  useEffect(() => {
    void sync("GET");
  }, [pathname, sync]);

  // A background tab's timers are throttled, so re-read on the way back in.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync("GET");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [sync]);

  useEffect(() => {
    if (expiresAt === null) {
      setMsLeft(null);
      return;
    }
    const tick = () => setMsLeft(Math.max(0, expiresAt - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (msLeft !== 0 || expiring.current) return;
    expiring.current = true;
    // Tear the session down server-side, then do a full load so nothing
    // rendered under the old session survives in the client cache.
    void fetch("/api/session", { method: "DELETE" }).finally(() => {
      window.location.href = "/login";
    });
  }, [msLeft]);

  if (msLeft === null || msLeft > COUNTDOWN_MS) return null;

  const seconds = Math.ceil(msLeft / 1000);
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-body"
      >
        <h2 id="session-timeout-title" className="modal-title">
          Still there?
        </h2>
        <p id="session-timeout-body" className="modal-body">
          You&rsquo;ve been idle for a while. For your logbook&rsquo;s security you&rsquo;ll be signed
          out in{" "}
          <strong className="modal-count">
            {seconds} second{seconds === 1 ? "" : "s"}
          </strong>
          .
        </p>
        {/* Announce roughly once a second without the count itself being a live
            region, which would make screen readers read the whole sentence. */}
        <span className="sr-only" role="status" aria-live="polite">
          {seconds % 10 === 0 || seconds <= 5 ? `${seconds} seconds remaining` : ""}
        </span>
        <div className="modal-actions">
          <button type="button" autoFocus onClick={() => void sync("POST")}>
            Stay signed in
          </button>
        </div>
        <div
          className="modal-progress"
          style={{ width: `${(msLeft / COUNTDOWN_MS) * 100}%` }}
          aria-hidden
          title={`${COUNTDOWN_SECONDS}-second warning`}
        />
      </div>
    </div>
  );
}

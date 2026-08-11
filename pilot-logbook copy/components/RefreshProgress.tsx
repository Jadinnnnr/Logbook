"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshFraction, type RefreshStatus } from "@/lib/refreshshape";

/**
 * The progress bar for a running refresh.
 *
 * A client component because it polls: the status file is rewritten every few
 * seconds by a detached process the server knows nothing about, so a bar
 * rendered once on the server would sit frozen at whatever it happened to catch
 * — which reads as "stuck" rather than "working".
 *
 * Polling stops the moment the run finishes. There is nothing to watch on a
 * page that isn't rebuilding anything.
 */
export default function RefreshProgress({
  initialStatus,
  initialRunning,
}: {
  initialStatus: RefreshStatus | null;
  initialRunning: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [running, setRunning] = useState(initialRunning);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch("/api/refresh-status", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { status: RefreshStatus | null; running: boolean };
        if (cancelled) return;
        setStatus(data.status);
        if (!data.running) {
          setRunning(false);
          // The datasets' own rows — sizes, counts, build dates — are rendered
          // on the server, so they need a re-render to catch up.
          router.refresh();
        }
      } catch {
        // A dropped poll is not worth reporting; the next one will do.
      }
    };

    const id = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running, router]);

  if (!status || !running) return null;

  const fraction = refreshFraction(status);
  const current = status.steps.find((s) => s.state === "running");
  const done = status.steps.filter((s) => s.state === "done" || s.state === "error").length;

  return (
    <div className="refresh-progress" role="status" aria-live="polite">
      <div className="refresh-bar-head">
        <span>
          {current ? current.label : "Starting"}
          {current?.stage && <span className="muted"> · {current.stage}</span>}
        </span>
        <span className="muted">
          step {Math.min(done + 1, status.steps.length)} of {status.steps.length}
        </span>
      </div>

      <div
        className="refresh-bar"
        role="progressbar"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Refresh progress"
      >
        <div className="refresh-bar-fill" style={{ width: `${Math.max(2, fraction * 100)}%` }} />
      </div>

      <ul className="refresh-steps">
        {status.steps.map((step) => (
          <li key={step.key} className={`refresh-step refresh-step-${step.state}`}>
            <span className="refresh-step-label">{step.label}</span>
            <span className="refresh-step-track">
              <span
                className="refresh-step-fill"
                style={{
                  width:
                    step.state === "done" || step.state === "error"
                      ? "100%"
                      : `${(step.fraction ?? 0) * 100}%`,
                }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

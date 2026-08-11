// Rebuilds every dataset that goes stale, writing progress to
// data/refresh-status.json so the app can show what's happening.
//
// Usage: node scripts/refresh-data.mjs [--with-registry]
//
// Airport data (28-day chart cycle) and the FAR/AIM copy are always refreshed.
// The aircraft registry is a much larger download, so it's opt-in.
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const withRegistry = process.argv.includes("--with-registry");
const statusPath = path.join("data", "refresh-status.json");
fs.mkdirSync("data", { recursive: true });

const steps = [
  { key: "airports", label: "Airport data", script: "scripts/build-airportdata.mjs", args: [] },
  { key: "reference", label: "FAR / AIM", script: "scripts/build-reference.mjs", args: [] },
];
if (withRegistry) {
  steps.push({ key: "registry", label: "Aircraft registry", script: "scripts/build-registry.mjs", args: [] });
}

const status = {
  state: "running",
  startedAt: new Date().toISOString(),
  finishedAt: null,
  steps: steps.map((s) => ({
    key: s.key,
    label: s.label,
    state: "pending",
    message: "",
    /** 0–1 through this step, or null before it has said anything. */
    fraction: null,
    /** What it is working on right now. */
    stage: "",
  })),
};

function write() {
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}
write();

function run(step, index) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [step.script, ...step.args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Keep the whole tail plus any explicit error lines: a bare stack trace
    // ("at ModuleJob.run …") tells the reader nothing about what went wrong.
    let tail = "";
    let errorLines = [];
    const capture = (chunk) => {
      const text = chunk.toString();
      // ##PROGRESS <done> <total> <label> — see build-reference.mjs.
      for (const line of text.split("\n")) {
        const m = line.match(/^##PROGRESS\s+([\d.]+)\s+([\d.]+)\s+(.*)$/);
        if (!m) continue;
        const done = Number(m[1]);
        const total = Number(m[2]);
        if (!(total > 0)) continue;
        status.steps[index].fraction = Math.min(1, Math.max(0, done / total));
        status.steps[index].stage = m[3].trim();
        write();
      }
      tail = (tail + text).split("\n").slice(-40).join("\n");
      for (const line of text.split("\n")) {
        if (/\b(Error|error|failed|ENOENT|EACCES)\b/.test(line) && !/^\s*at\s/.test(line)) {
          errorLines.push(line.trim());
        }
      }
    };
    child.stdout.on("data", (c) => {
      capture(c);
      process.stdout.write(c.toString().replace(/^##PROGRESS .*$\n?/gm, ""));
    });
    child.stderr.on("data", (c) => {
      capture(c);
      process.stderr.write(c);
    });
    child.on("close", (code) => resolve({ code, tail: tail.trim(), errorLines }));
  });
}

let failed = 0;
for (let i = 0; i < steps.length; i++) {
  status.steps[i].state = "running";
  write();
  const { code, tail, errorLines } = await run(steps[i], i);
  status.steps[i].state = code === 0 ? "done" : "error";
  // A finished step is a full bar either way — an error that stopped at 40%
  // shouldn't leave the bar looking like it's still going.
  status.steps[i].fraction = 1;
  status.steps[i].stage = "";
  if (code === 0) {
    status.steps[i].message = tail.split("\n").filter(Boolean).pop() ?? "";
  } else {
    // Prefer a real error line; fall back to the last non-stack output.
    const reason =
      errorLines.slice(-2).join(" · ") ||
      tail.split("\n").filter((l) => l.trim() && !/^\s*at\s/.test(l)).pop() ||
      "no output";
    status.steps[i].message = `exit ${code}: ${reason}`.slice(0, 300);
  }
  if (code !== 0) failed++;
  write();
}

status.state = failed ? "error" : "done";
status.finishedAt = new Date().toISOString();
write();
console.log(`\nRefresh ${status.state} (${steps.length - failed}/${steps.length} succeeded)`);
process.exit(failed ? 1 : 0);

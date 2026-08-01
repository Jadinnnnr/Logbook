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
  steps: steps.map((s) => ({ key: s.key, label: s.label, state: "pending", message: "" })),
};

function write() {
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}
write();

function run(step) {
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
      tail = (tail + text).split("\n").slice(-40).join("\n");
      for (const line of text.split("\n")) {
        if (/\b(Error|error|failed|ENOENT|EACCES)\b/.test(line) && !/^\s*at\s/.test(line)) {
          errorLines.push(line.trim());
        }
      }
    };
    child.stdout.on("data", (c) => {
      capture(c);
      process.stdout.write(c);
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
  const { code, tail, errorLines } = await run(steps[i]);
  status.steps[i].state = code === 0 ? "done" : "error";
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

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const npmCli = process.env.npm_execpath;
assert.ok(
  npmCli && existsSync(npmCli),
  "Run this workflow with npm run verify",
);
const steps = [
  ["Formatting", ["run", "format:check"]],
  ["Documentation and local links", ["run", "docs:check"]],
  ["Unit, API and provider-boundary tests", ["test"]],
  ["Type checking and production build", ["run", "build"]],
  ["Compiled backend HTTP and SDK smoke tests", ["run", "test:api"]],
  ["Desktop/mobile browser controls and workflows", ["run", "test:e2e"]],
  ["Dependency audit", ["audit", "--audit-level=moderate"]],
];
const report = {
  startedAt: new Date().toISOString(),
  status: "running",
  steps: [],
};
mkdirSync("output", { recursive: true });
function save() {
  writeFileSync("output/verification.json", JSON.stringify(report, null, 2));
}
save();
for (const [name, args] of steps) {
  console.log(`\nChecking: ${name}`);
  const started = Date.now();
  const exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, [npmCli, ...args], {
      stdio: "inherit",
    });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
  report.steps.push({
    name,
    status: exitCode === 0 ? "passed" : "failed",
    exitCode,
    durationMs: Date.now() - started,
  });
  save();
  if (exitCode !== 0) {
    report.status = "failed";
    process.exitCode = 1;
    break;
  }
}
if (report.status === "running") report.status = "passed";
report.finishedAt = new Date().toISOString();
save();
console.log(
  `\nVerification ${report.status}. Evidence: output/verification.json`,
);

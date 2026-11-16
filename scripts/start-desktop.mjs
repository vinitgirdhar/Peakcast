import electronPath from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) loadEnvFile(".env");

assert.ok(
  existsSync(electronPath),
  "Install the Electron runtime before starting the desktop app",
);
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath, ["."], {
  env: environment,
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

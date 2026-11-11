#!/usr/bin/env node
// Starts the three dev terminals for this repo in herdr-core (`hc`), so they show up in the herdr app:
//   claude: Claude Code | tauri: pnpm tauri dev (also starts Vite) | convex: npx convex dev
// Terminals that are already live under the same name are left alone, so running it twice is safe.
// Usage: pnpm herdr
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";

const terminals = [
  { name: "chat-claude", argv: ["claude"] },
  { name: "chat-tauri", line: "pnpm tauri dev" },
  { name: "chat-convex", line: "npx convex dev" },
];

// The herdr installer puts hc on the user PATH, but a shell opened before the install does not see it yet.
function findHc() {
  const installed = isWindows && join(process.env.LOCALAPPDATA ?? "", "Programs", "herdr-core", "hc.exe");
  return installed && existsSync(installed) ? installed : "hc";
}

const hcBin = findHc();

function hc(...args) {
  try {
    return JSON.parse(execFileSync(hcBin, [...args, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error("hc (herdr-core) not found. Install herdr from https://herdr.dev and open a new terminal.");
    } else {
      console.error(`hc ${args.join(" ")} failed:\n${err.stderr || err.message}`);
    }
    process.exit(1);
  }
}

// pnpm and npx are .cmd shims on Windows, so they run inside a shell. The shell stays open after the
// command ends, so a crash leaves its output readable instead of closing the terminal.
function commandFor({ argv, line }) {
  if (argv) return argv;
  return isWindows ? ["powershell.exe", "-NoLogo", "-NoExit", "-Command", line] : ["sh", "-c", `${line}; exec "$SHELL"`];
}

const live = new Set(hc("ls").terminals.map((t) => t.name).filter(Boolean));

for (const t of terminals) {
  if (live.has(t.name)) {
    console.log(`${t.name}: already running, skipped`);
    continue;
  }
  const started = hc("run", "--bg", "--no-parent", "--name", t.name, "--cwd", root, "--label", "project=chat-app", "--", ...commandFor(t));
  console.log(`${t.name}: started ${started.address ?? ""}`.trim());
}

console.log("Open them in the herdr app, or attach with: hc attach chat-claude");

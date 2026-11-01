// PROTOTYPE, throwaway. Fixed values shared by the harness, the WDIO config and the specs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const STAGE = path.join(HERE, '.stage');
export const SNAPSHOTS = path.join(STAGE, 'snapshots');
export const PROFILES = path.join(HERE, '.profiles');
export const SESSIONS_FILE = path.join(STAGE, 'sessions.json');
export const TIMINGS_FILE = path.join(STAGE, 'timings.jsonl');
export const FRIENDS_ROWS = path.join(STAGE, 'friends.rows.json');

export const CLOUD = 'http://127.0.0.1:3310';
export const SITE = 'http://127.0.0.1:3311';
export const APP_ORIGIN = 'http://tauri.localhost';
export const APP_URL = `${APP_ORIGIN}/`;
export const PORTS = [3310, 3311, 3312, 4540, 4541];
export const STUB_LOG = path.join(STAGE, 'stub.log');
export const FIXTURE_PNG = path.join(STAGE, 'pixel.png');

export const BACKEND_VERSION = 'precompiled-2026-10-22-1447815';
// Test-only and committed on purpose. It must never be set on a real deployment.
export const SECRET = 'e2e-prototype-test-only-secret-0123456789abcdef';
export const IDENTIFIER = 'dev.NoahGiesel.chat.e2e';
export const EXE = path.join(ROOT, 'src-tauri', 'target', 'debug', 'tauri-convex-chat.exe');

export const PASSWORD = 'correct-horse-battery';
export const USERS = {
  alice: { name: 'Alice Test', email: 'alice@e2e.invalid' },
  bob: { name: 'Bob Test', email: 'bob@e2e.invalid' },
  carol: { name: 'Carol Test', email: 'carol@e2e.invalid' },
};

/** The developer's environment is not inherited: every CONVEX_* variable is removed. */
export function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('CONVEX_')) delete env[key];
  return { ...env, ...extra };
}

const CONVEX_BIN = path.join(ROOT, 'node_modules', 'convex', 'bin', 'main.js');

/** Runs the Convex CLI from the stage, so it can only see the stage's anonymous deployment. */
export function convexSync(args, { allowFail = false } = {}) {
  const res = spawnSync(process.execPath, [CONVEX_BIN, ...args], { cwd: STAGE, env: cleanEnv(), encoding: 'utf8' });
  if (res.status !== 0 && !allowFail) throw new Error(`convex ${args.join(' ')} failed\n${res.stdout}\n${res.stderr}`);
  return res;
}

export function convexDevProcess() {
  return spawn(
    process.execPath,
    [
      CONVEX_BIN, 'dev',
      '--local-cloud-port', '3310', '--local-site-port', '3311',
      '--local-backend-version', BACKEND_VERSION,
      '--typecheck', 'disable', '--tail-logs', 'disable',
    ],
    { cwd: STAGE, env: cleanEnv({ CONVEX_AGENT_MODE: 'anonymous' }), stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

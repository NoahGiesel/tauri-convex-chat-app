// Fixed values. The target lives here and nowhere else: no flag or environment variable changes it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(E2E_DIR, '..');
export const STAGE = path.join(E2E_DIR, '.stage');
export const SNAPSHOTS = path.join(STAGE, 'snapshots');
export const SESSIONS_FILE = path.join(STAGE, 'sessions.json');
export const PROFILES = path.join(E2E_DIR, '.profiles');
export const EXE = path.join(ROOT, 'src-tauri', 'target', 'debug', 'tauri-convex-chat.exe');

export const CONVEX_URL = 'http://127.0.0.1:3310';
export const SITE_URL = 'http://127.0.0.1:3311';
export const STUB_URL = 'http://127.0.0.1:3312';
export const CONVEX_PORT = 3310;
export const SITE_PORT = 3311;
/** The first instance's WebDriver port. The service gives the next instance this port plus one. */
export const FIRST_INSTANCE_PORT = 4540;
export const PORTS = [CONVEX_PORT, SITE_PORT, 3312, FIRST_INSTANCE_PORT, FIRST_INSTANCE_PORT + 1];

/** In this order: `alice` gets 4540 and `bob` gets 4541. */
export const DRIVEN_USERS = ['alice', 'bob'];

export const APP_ORIGIN = 'http://tauri.localhost';
export const APP_URL = `${APP_ORIGIN}/`;
export const IDENTIFIER = 'dev.NoahGiesel.chat.e2e';

/** The name `CONVEX_AGENT_MODE=anonymous` gives the deployment. */
export const DEPLOYMENT = 'anonymous:anonymous-agent';
export const BACKEND_VERSION = 'precompiled-2026-10-22-1447815';
// Test-only and committed on purpose. It must never be set on a real deployment.
export const TEST_SECRET = 'e2e-test-only-secret-never-use-on-a-real-deployment';

export const PASSWORD = 'correct-horse-battery';
export const USERS = {
  alice: { name: 'Alice Test', email: 'alice@e2e.invalid' },
  bob: { name: 'Bob Test', email: 'bob@e2e.invalid' },
  carol: { name: 'Carol Test', email: 'carol@e2e.invalid' },
};

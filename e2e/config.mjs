// Fixed values. The target lives here and nowhere else: no flag or environment variable changes it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(E2E_DIR, '..');
export const STAGE = path.join(E2E_DIR, '.stage');
export const SNAPSHOTS = path.join(STAGE, 'snapshots');
/** Photos, a video and other files that tests and the `media` Seed upload. */
export const ASSETS = path.join(E2E_DIR, 'assets');
/** Each asset's type, by extension, as a file picker reports it. */
export const ASSET_TYPES = { '.png': 'image/png', '.mp4': 'video/mp4', '.txt': 'text/plain', '.json': 'application/json' };
export const SESSIONS_FILE = path.join(STAGE, 'sessions.json');
/** Written once a test has ended. The stage starts empty, so a run that leaves none matched no test. */
export const TEST_RAN_FILE = path.join(STAGE, 'a-test-ran');
export const PROFILES = path.join(E2E_DIR, '.profiles');
/** What the stub keeps. In the stage, so each run starts with none, and a Reset never touches it. */
export const STUB_FILES = path.join(STAGE, 'stub');
export const STUB_LOG = path.join(STAGE, 'stub-log.jsonl');
/** Outside the stage, so that the pictures of a failed run outlive it until the next run. */
export const FAILURES = path.join(E2E_DIR, '.failures');
export const IS_MAC = process.platform === 'darwin';
export const EXE = path.join(ROOT, 'src-tauri', 'target', 'debug', IS_MAC ? 'tauri-convex-chat' : 'tauri-convex-chat.exe');

export const CONVEX_PORT = 3310;
export const SITE_PORT = 3311;
export const STUB_PORT = 3312;
export const CONVEX_URL = `http://127.0.0.1:${CONVEX_PORT}`;
export const SITE_URL = `http://127.0.0.1:${SITE_PORT}`;
export const STUB_URL = `http://127.0.0.1:${STUB_PORT}`;
/** The first instance's WebDriver port. The service gives the next instance this port plus one. */
export const FIRST_INSTANCE_PORT = 4540;
export const PORTS = [CONVEX_PORT, SITE_PORT, STUB_PORT, FIRST_INSTANCE_PORT, FIRST_INSTANCE_PORT + 1];
export const INTERFACE_WAIT_MS = 5_000;
/** How often a wait looks again. */
export const POLL_MS = 100;
/** One whole test, Fixture included. */
export const TEST_LIMIT_MS = 30_000;

/** In this order: `alice` gets 4540 and `bob` gets 4541. */
export const DRIVEN_USERS = ['alice', 'bob'];

/** What the app's pages come from: WebView2 serves them over http, WKWebView over its own scheme. */
export const APP_ORIGIN = IS_MAC ? 'tauri://localhost' : 'http://tauri.localhost';
/** The main window's handle, which is its Tauri label. A popout's holds its conversation ID, so no test names one. */
export const MAIN_WINDOW = 'main';
export const APP_URL = `${APP_ORIGIN}/`;
export const IDENTIFIER = 'dev.NoahGiesel.chat.e2e';

/** The name `CONVEX_AGENT_MODE=anonymous` gives the deployment. */
export const DEPLOYMENT = 'anonymous:anonymous-agent';
export const BACKEND_VERSION = 'precompiled-2026-10-22-1447815';
// Test-only and committed on purpose. It must never be set on a real deployment.
export const TEST_SECRET = 'e2e-test-only-secret-never-use-on-a-real-deployment';

export const EXPIRED_INVITE_TOKEN = 'e2e-expired-invite';
/** On top of `friends`' one, so that the direct chat holds three pages of 30. */
export const HISTORY_MESSAGES = 70;

/** What the `media` Seed holds, all sent by Alice to Bob. Tests refer to it by these names and words. */
export const MEDIA_SEED = {
  photo: { file: 'sunset.png', caption: 'Seeded photo' },
  video: { file: 'clip.mp4', caption: 'Seeded video' },
  // A reserved domain, whose preview is Seeded, so the app never fetches it.
  link: { url: 'https://example.com/seeded-page', caption: 'Seeded link' },
  preview: { title: 'A Seeded page', description: 'Words from the Seed', siteName: 'Example' },
  avatar: 'harbour.png',
};
export const PASSWORD = 'correct-horse-battery';
export const USERS = {
  alice: { name: 'Alice Test', email: 'alice@e2e.invalid' },
  bob: { name: 'Bob Test', email: 'bob@e2e.invalid' },
  carol: { name: 'Carol Test', email: 'carol@e2e.invalid' },
};

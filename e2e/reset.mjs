// A Reset returns the Test backend to exactly one Seed. Fixtures own it, so it runs before every test.
import fs from 'node:fs';
import path from 'node:path';
import { APP_URL, DRIVEN_USERS, INTERFACE_WAIT_MS, SESSIONS_FILE, SNAPSHOTS } from './config.mjs';
import { confirmInstance } from './guards.mjs';
import { convexInStage } from './stage.mjs';

const MAIN_WINDOW = 'main';
const WAIT = { timeout: INTERFACE_WAIT_MS, interval: 50 };

const instance = (name) => browser.getInstance(name);
const forEachInstance = (action) => Promise.all(DRIVEN_USERS.map((name) => action(instance(name), name)));

/** Waits for the app page to load, then checks which backend this instance was built for. */
async function confirmLoadedApp(b, name) {
  await b.waitUntil(() => b.execute(() => document.readyState === 'complete' && location.href !== 'about:blank'), {
    ...WAIT,
    timeoutMsg: `${name} did not load the app`,
  });
  confirmInstance(name, await b.execute(() => window.__E2E__));
}

// A failing root hook runs no tests at all. Every spec reaches this through its Fixture, before any session exists.
before('every instance is on the Test backend', () => forEachInstance(confirmLoadedApp));

async function closePopouts(b) {
  for (const handle of await b.getWindowHandles()) {
    if (handle === MAIN_WINDOW) continue;
    await b.switchToWindow(handle);
    await b.closeWindow();
  }
  await b.switchToWindow(MAIN_WINDOW);
}

/** This must come first of the page steps, because about:blank has no localStorage. */
const restoreSession = (b, name) => {
  const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  return b.execute((cookie) => {
    localStorage.clear();
    localStorage.setItem('better-auth_cookie', cookie);
  }, sessions[name]);
};

/** Live apps write into fresh data through `heartbeat` and `markRead`. `url()` returns before the navigation ends. */
async function leaveApp(b, name) {
  await b.url('about:blank');
  await b.waitUntil(async () => (await b.execute(() => location.href)) === 'about:blank', {
    ...WAIT,
    timeoutMsg: `${name} did not leave the app page`,
  });
}

async function loadApp(b, name) {
  await b.url(APP_URL);
  await confirmLoadedApp(b, name);
}

export async function reset(seed) {
  await forEachInstance(closePopouts);
  await forEachInstance(restoreSession);
  await forEachInstance(leaveApp);
  convexInStage(['import', '--replace-all', '--yes', path.join(SNAPSHOTS, `${seed}.zip`)]);
  await forEachInstance(loadApp);
}

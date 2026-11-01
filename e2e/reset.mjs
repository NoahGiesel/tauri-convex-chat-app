// A Reset returns the Test backend to exactly one Seed. Fixtures own it, so it runs before every test.
import fs from 'node:fs';
import path from 'node:path';
import { APP_URL, DRIVEN_USERS, FAILURES, INTERFACE_WAIT_MS, SESSIONS_FILE, TEST_RAN_FILE } from './config.mjs';
import { confirmInstance } from './guards.mjs';
import { screenshotName } from './report.mjs';
import { importSeed } from './stage.mjs';

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

/** A hung app answers nothing, and only the limit ends the wait. */
function withinLimit(work, what) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took over ${INTERFACE_WAIT_MS} ms`)), INTERFACE_WAIT_MS);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** One dead instance must not cost the picture of the other. */
async function saveScreenshot(b, name, testTitle) {
  try {
    fs.mkdirSync(FAILURES, { recursive: true });
    await withinLimit(b.saveScreenshot(path.join(FAILURES, screenshotName(testTitle, name))), `a screenshot of ${name}`);
  } catch (err) {
    console.error(`[e2e] no screenshot of ${name}: ${err.message}`);
  }
}

async function stopIfDead(b, name, testTitle) {
  try {
    await withinLimit(b.execute(() => true), `a ping of ${name}`);
  } catch (err) {
    const message = `${name} stopped responding, so the run stops. Last test: ${testTitle}. ${err.message}`;
    // WDIO fails too when it closes the dead session, and that loses the report holding the throw below.
    console.error(`[e2e] FAILED: ${message}`);
    throw new Error(message);
  }
}

// A hook, not WDIO's afterTest: Mocha does not wait for that after a timeout, so a picture would race the next Reset.
// It runs after the last test too, and a throw in a root hook stops every later test: a dead instance is never restarted.
afterEach('a failed test leaves pictures, and a dead instance stops the run', async function afterEveryTest() {
  const { state } = this.currentTest;
  const title = this.currentTest.fullTitle();
  fs.writeFileSync(TEST_RAN_FILE, title);
  if (state === 'failed') await forEachInstance((b, name) => saveScreenshot(b, name, title));
  await forEachInstance((b, name) => stopIfDead(b, name, title));
});

async function closePopouts(b) {
  for (const handle of await b.getWindowHandles()) {
    if (handle === MAIN_WINDOW) continue;
    await b.switchToWindow(handle);
    await b.closeWindow();
  }
  await b.switchToWindow(MAIN_WINDOW);
}

/** This must come first of the page steps, because about:blank has no localStorage. */
const prepareStorage = (b, name, signedIn) => {
  const cookie = signedIn ? JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'))[name] : null;
  return b.execute((session) => {
    localStorage.clear();
    if (session) localStorage.setItem('better-auth_cookie', session);
  }, cookie);
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

export async function reset(seed, { signedIn = true } = {}) {
  await forEachInstance(closePopouts);
  await forEachInstance((b, name) => prepareStorage(b, name, signedIn));
  await forEachInstance(leaveApp);
  importSeed(seed);
  await forEachInstance(loadApp);
}

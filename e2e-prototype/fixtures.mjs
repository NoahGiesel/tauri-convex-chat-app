// PROTOTYPE, throwaway. The Reset sequence and the small page object the spec reads through.
import fs from 'node:fs';
import path from 'node:path';
import { APP_URL, SESSIONS_FILE, SNAPSHOTS, TIMINGS_FILE, convexSync } from './config.mjs';

const sessions = () => JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
export const note = (label, ms) => fs.appendFileSync(TIMINGS_FILE, `${JSON.stringify({ label, ms: Math.round(ms) })}\n`);

async function timed(label, fn) {
  const start = performance.now();
  const out = await fn();
  note(label, performance.now() - start);
  return out;
}

export const importSeed = (seed) => timed(`reset: import ${seed}`, async () =>
  convexSync(['import', '--replace-all', '--yes', path.join(SNAPSHOTS, `${seed}.zip`)]));

/** Rows the app could change, so a stray write shows up in a diff. */
export function readRows() {
  const out = {};
  for (const table of ['profiles', 'members', 'messages']) {
    const res = convexSync(['data', table, '--limit', '100', '--format', 'jsonLines']);
    out[table] = res.stdout.trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))
      .sort((a, b) => a._id.localeCompare(b._id));
  }
  return out;
}

const app = (name) => browser.getInstance(name);
const NAMES = ['alice', 'bob'];

/** Clear and restore while the app page is still open, since about:blank has no localStorage. */
export async function restoreStorage(signedIn) {
  const s = sessions();
  await timed('reset: clear and restore localStorage', async () => {
    for (const name of NAMES) {
      await app(name).execute((cookie) => {
        localStorage.clear();
        if (cookie) localStorage.setItem('better-auth_cookie', cookie);
      }, signedIn.includes(name) ? s[name] : null);
    }
  });
}

/** `url()` returns before the navigation finishes, so wait until the app page is really gone. */
export const quiet = () => timed('reset: quiet apps', async () => {
  for (const name of NAMES) await app(name).url('about:blank');
  for (const name of NAMES) {
    await app(name).waitUntil(async () => (await app(name).execute(() => location.href)) === 'about:blank', {
      timeout: 5_000, interval: 10, timeoutMsg: `${name} did not leave the app page`,
    });
  }
});

export const loadApps = () => timed('reset: load apps', async () => {
  for (const name of NAMES) await app(name).url(APP_URL);
  for (const name of NAMES) {
    await app(name).waitUntil(async () => (await app(name).execute(() => !!window.__E2E__ && document.readyState === 'complete')), {
      timeout: 10_000, interval: 10, timeoutMsg: `${name} did not load the app`,
    });
  }
});

/** The decided sequence. Returns what the database held before any app was loaded. */
export async function reset(seed, { signedIn = NAMES } = {}) {
  const start = performance.now();
  await restoreStorage(signedIn);
  await quiet();
  await importSeed(seed);
  note('reset: total without load', performance.now() - start);
  await loadApps();
  note('reset: total', performance.now() - start);
}

export function user(name) {
  const b = app(name);
  return {
    name,
    b,
    async openChat(title) {
      const row = b.$(`//button[.//*[normalize-space(text())="${title}"] or @aria-label="${title}" or @title="${title}"]`);
      await row.waitForClickable({ timeout: 15_000 });
      await row.click();
      await b.$('textarea[aria-label="Write a message…"]').waitForDisplayed({ timeout: 10_000 });
    },
    async send(text) {
      const box = b.$('textarea[aria-label="Write a message…"]');
      await box.setValue(text);
      await b.keys('Enter');
    },
    async sees(text, timeout = 10_000) {
      await b.$(`//*[contains(normalize-space(.), "${text}") and not(*)]`).waitForDisplayed({ timeout });
    },
    async doesNotSee(text) {
      if (await b.$(`//*[contains(normalize-space(.), "${text}") and not(*)]`).isExisting()) {
        throw new Error(`${name} still sees "${text}"`);
      }
    },
    async signOut() {
      await b.$('button[aria-label="Settings"]').click();
      const button = b.$('//button[normalize-space(.)="Sign out"]');
      await button.waitForClickable({ timeout: 10_000 });
      await button.click();
    },
    async seesAuthScreen() {
      await b.$('input[type="password"]').waitForDisplayed({ timeout: 15_000 });
    },
  };
}

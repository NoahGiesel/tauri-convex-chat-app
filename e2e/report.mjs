// What a run tells the developer: its timings, and a picture of both instances when a test fails.
import fs from 'node:fs';
import path from 'node:path';
import { DRIVEN_USERS, FAILURES, INTERFACE_WAIT_MS } from './config.mjs';

const RUN_WARNING_MS = 10 * 60_000;
const MAX_TITLE_CHARS = 80;

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** `steps` holds `{ name, ms }`. A slow run warns and does not fail. */
export function timingReport(steps) {
  const total = steps.reduce((sum, { ms }) => sum + ms, 0);
  const rows = [...steps, { name: 'total', ms: total }];
  const width = Math.max(...rows.map(({ name }) => name.length));
  const lines = rows.map(({ name, ms }) => `${name.padEnd(width)}  ${seconds(ms)}`);
  if (total > RUN_WARNING_MS) lines.push(`WARNING: the run took ${seconds(total)}, over the 10 minutes it should stay under`);
  return lines;
}

export function screenshotName(title, instance) {
  const slug = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, MAX_TITLE_CHARS);
  return `${slug}-${instance}.png`;
}

/** A hung app answers nothing, and only the limit ends the wait. */
export function withinLimit(work, what) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took over ${seconds(INTERFACE_WAIT_MS)}`)), INTERFACE_WAIT_MS);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** One dead instance must not cost the picture of the other. */
export async function saveScreenshots(browser, title) {
  fs.mkdirSync(FAILURES, { recursive: true });
  await Promise.all(DRIVEN_USERS.map(async (name) => {
    try {
      await withinLimit(browser.getInstance(name).saveScreenshot(path.join(FAILURES, screenshotName(title, name))), `a screenshot of ${name}`);
    } catch (err) {
      console.error(`[e2e] no screenshot of ${name}: ${err.message}`);
    }
  }));
}

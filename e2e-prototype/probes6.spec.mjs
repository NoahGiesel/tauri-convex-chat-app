// PROTOTYPE, throwaway. Why did a message sent right after opening a chat not appear?
import { en } from '../src/i18n/en.ts';
import { reset, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);
const composer = `textarea[aria-label="${en['chat.composer']}"]`;

async function attempt(label, gapMs) {
  await reset('friends');
  const alice = user('alice');
  const b = alice.b;
  await alice.openChat('Bob Test');
  if (gapMs) await browser.pause(gapMs);
  const text = `Msg ${label}`;
  const box = b.$(composer);
  await box.setValue(text);
  const typed = await box.getValue();
  await b.keys('Enter');
  await browser.pause(1_500);
  const state = await b.execute((css, t) => {
    const el = document.querySelector(css);
    const hits = [...document.querySelectorAll('*')].filter((n) => n.children.length === 0 && n.textContent.includes(t));
    return {
      composerValue: el?.value ?? null,
      active: document.activeElement?.tagName,
      inDom: hits.map((h) => `${h.tagName} rects=${h.getClientRects().length}`),
      hasFocus: document.hasFocus(),
    };
  }, composer, text);
  log(`${label}: typed="${typed}" ${JSON.stringify(state)}`);
}

describe('send race', () => {
  for (const i of [1, 2, 3, 4, 5]) it(`no gap ${i}`, async () => attempt(`nogap${i}`, 0));
  for (const i of [1, 2, 3]) it(`1 s gap ${i}`, async () => attempt(`gap${i}`, 1_000));
});

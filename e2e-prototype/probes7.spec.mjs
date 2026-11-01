// PROTOTYPE, throwaway. Does a held element go stale when the optimistic message is replaced?
import { en } from '../src/i18n/en.ts';
import { reset, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);
const leaf = (text) => `//*[contains(normalize-space(.), "${text}") and not(*)]`;

async function sendFresh(text) {
  await reset('friends');
  const alice = user('alice');
  await alice.openChat('Bob Test');
  await alice.send(text);
  return alice;
}

describe('stale elements', () => {
  it('held element, 12 runs', async () => {
    let failures = 0;
    for (let i = 1; i <= 12; i++) {
      const text = `Held ${i}`;
      const alice = await sendFresh(text);
      const held = alice.b.$(leaf(text));
      try {
        await held.waitForDisplayed({ timeout: 3_000 });
      } catch {
        failures += 1;
        const again = await alice.b.$(leaf(text)).isDisplayed();
        log(`held ${i}: timed out; same element now=${await held.isDisplayed().catch((e) => e.message.slice(0, 60))}; fresh lookup=${again}`);
      }
    }
    log(`held element: ${failures} of 12 timed out`);
  });

  it('fresh lookup on every poll, 12 runs', async () => {
    let failures = 0;
    for (let i = 1; i <= 12; i++) {
      const text = `Fresh ${i}`;
      const alice = await sendFresh(text);
      try {
        await browser.waitUntil(async () => alice.b.$(leaf(text)).isDisplayed(), { timeout: 3_000, interval: 100 });
      } catch {
        failures += 1;
      }
    }
    log(`fresh lookup: ${failures} of 12 timed out`);
  });

  it('clickability with a draft', async () => {
    await reset('friends');
    const alice = user('alice');
    await alice.openChat('Bob Test');
    const b = alice.b;
    const send = b.$(`aria/${en['chat.send']}`);
    await b.$(`aria/${en['chat.composer']}`).setValue('Draft');
    await browser.pause(300);
    log(`send with draft: enabled=${await send.isEnabled()} clickable=${await send.isClickable()}`);
    await b.execute(() => {
      const cover = document.createElement('div');
      cover.style.cssText = 'position:fixed;inset:0;z-index:99999';
      document.body.appendChild(cover);
    });
    log(`send under cover: enabled=${await send.isEnabled()} clickable=${await send.isClickable()}`);
    log(`elementFromPoint is the button: ${await b.execute((label) => {
      const el = document.querySelector('[aria-label="' + label + '"]');
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return el === top || el.contains(top);
    }, en['chat.send'])}`);
  });
});

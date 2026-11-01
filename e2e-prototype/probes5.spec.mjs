// PROTOTYPE, throwaway. Can a Fixture refuse to click what a person could not click?
import { en } from '../src/i18n/en.ts';
import { reset, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);

describe('clickability', () => {
  for (const run of [1, 2, 3, 4, 5, 6]) it(`compares isDisplayed and isClickable ${run}`, async () => {
    await reset('friends');
    const alice = user('alice');
    await alice.openChat('Bob Test');
    const b = alice.b;
    await alice.send('Hover me');
    try {
      await alice.sees('Hover me');
      log('sees: ok');
    } catch (e) {
      const state = await b.execute(() => ({
        composer: document.querySelector('textarea')?.value ?? null,
        hits: [...document.querySelectorAll('*')].filter((n) => n.children.length === 0 && n.textContent.includes('Hover me'))
          .map((h) => `${h.tagName} rects=${h.getClientRects().length} parent=${String(h.parentElement.className).slice(0, 40)}`),
        error: document.querySelector('[role="alert"]')?.textContent ?? null,
      }));
      log(`sees FAILED: ${JSON.stringify(state)}`);
      throw e;
    }

    const state = async (label, el) => log(`${label}: displayed=${await el.isDisplayed()} clickable=${await el.isClickable()}`);
    const hidden = b.$(`(//*[@aria-label="${en['chat.editMessage']}"])[last()]`);
    const visible = b.$(`aria/${en['chat.send']}`);
    await state('hover-only edit button', hidden);
    await state('send button', visible);

    await b.execute(() => {
      const cover = document.createElement('div');
      cover.id = 'cover';
      cover.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.2)';
      document.body.appendChild(cover);
      window.__clicks = 0;
      document.addEventListener('click', () => { window.__clicks += 1; }, true);
    });
    await state('send button under a full-screen cover', visible);
    await b.$(`aria/${en['chat.composer']}`).setValue('Typed under the cover');
    await visible.click();
    await browser.pause(800);
    const sent = await b.$('//*[contains(normalize-space(.), "Typed under the cover") and not(*)]').isExisting();
    log(`click() under the cover: message sent=${sent}, click events=${await b.execute(() => window.__clicks)}`);
  });
});

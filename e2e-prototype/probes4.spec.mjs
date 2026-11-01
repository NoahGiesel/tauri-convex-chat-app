// PROTOTYPE, throwaway. Facts for "How do tests find elements?".
import { en } from '../src/i18n/en.ts';
import { reset, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);
const tryIt = async (label, fn) => {
  try { log(`${label}: ${await fn()}`); } catch (e) { log(`${label} THREW: ${e.message.split('\n')[0].slice(0, 120)}`); }
};

// Interactive elements with no accessible name, which no text or aria lookup can reach.
const unnamed = (b) => b.execute(() => {
  const name = (el) => (
    el.getAttribute('aria-label')
    || (el.labels && [...el.labels].map((l) => l.textContent).join(' '))
    || el.textContent
    || el.getAttribute('title')
    || el.getAttribute('placeholder')
    || el.querySelector?.('img')?.alt
    || ''
  ).trim();
  const all = [...document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="tab"], [draggable="true"]')];
  const missing = all.filter((el) => !name(el));
  return {
    total: all.length,
    missing: missing.map((el) => `${el.tagName.toLowerCase()}[type=${el.type ?? ''}] .${String(el.className).slice(0, 50)}`),
  };
});

describe('finding elements', () => {
  it('dumps the facts', async () => {
    log(`en.ts imported natively: ${en['common.signOut']}`);
    await reset('groups');
    const alice = user('alice');
    const bob = user('bob');
    await alice.openChat('Bob Test');
    await bob.openChat('Alice Test');
    const b = alice.b;

    await tryIt('aria/ selector on composer', async () => b.$(`aria/${en['chat.composer']}`).isExisting());
    await tryIt('aria/ selector on Settings', async () => b.$('aria/Settings').isExisting());
    await tryIt('button= text selector', async () => (await b.$(`button=${en['nav.chat']}`).isExisting()));
    await tryIt('getComputedRole', async () => b.$('textarea').getComputedRole());
    await tryIt('getComputedLabel', async () => b.$('textarea').getComputedLabel());

    log(`unnamed, chat open: ${JSON.stringify(await unnamed(b))}`);

    // Message actions are display:none until the row is hovered.
    await alice.send('Hover me');
    const text = b.$('//*[contains(normalize-space(.), "Hover me") and not(*)]');
    await text.waitForDisplayed({ timeout: 5_000 });
    const lastEdit = () => b.$(`(//*[@aria-label="${en['chat.editMessage']}"])[last()]`);
    const visibleActions = async () => {
      const shown = await b.execute((label) => {
        const all = [...document.querySelectorAll(`[aria-label="${label}"]`)];
        return { total: all.length, shown: all.filter((x) => x.getClientRects().length > 0).length };
      }, en['chat.editMessage']);
      return `${shown.shown} of ${shown.total} visible`;
    };
    log(`before hover: ${await visibleActions()}`);
    await tryIt('moveTo', async () => { await text.moveTo(); return 'done'; });
    await browser.pause(300);
    log(`after moveTo: ${await visibleActions()}`);
    await tryIt('performActions pointer move', async () => {
      await b.action('pointer').move({ origin: text }).perform();
      return 'done';
    });
    await browser.pause(300);
    log(`after action move: ${await visibleActions()}`);
    await tryIt('click a hidden edit button', async () => {
      await lastEdit().click();
      return 'done';
    });
    await browser.pause(300);
    log(`editor open: ${await b.$(`textarea[aria-label="${en['chat.editMessage']}"]`).isExisting()}`);
    await tryIt('click by script on edit button', async () => b.execute((label) => {
      const all = document.querySelectorAll(`[aria-label="${label}"]`);
      all[all.length - 1].click();
      return all.length;
    }, en['chat.editMessage']));
    await browser.pause(300);
    log(`editor open after script click: ${await b.$(`textarea[aria-label="${en['chat.editMessage']}"]`).isExisting()}`);
    await b.keys('Escape');

    await b.$('button[aria-label="Settings"]').click();
    await browser.pause(400);
    log(`unnamed, settings account: ${JSON.stringify(await unnamed(b))}`);
    await b.$(`//button[normalize-space(.)="${en['settings.nav.appearance']}"]`).click();
    await browser.pause(400);
    log(`unnamed, settings appearance: ${JSON.stringify(await unnamed(b))}`);
  });
});

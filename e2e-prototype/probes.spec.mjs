// PROTOTYPE, throwaway. Facts for "Which Fixtures does phase one need?". Probes log and do not stop each other.
import assert from 'node:assert/strict';
import { reset, scripted, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);
const composers = async (b) => (await b.$$('textarea[aria-label="Write a message…"]').getElements()).length;

const spy = (b) => b.execute(() => {
  window.__drag = [];
  for (const type of ['dragstart', 'dragenter', 'dragover', 'drop', 'dragend']) {
    document.addEventListener(type, () => { window.__drag.push(type); }, true);
  }
});
const spied = async (b) => {
  const seen = await b.execute(() => window.__drag ?? []);
  return [...new Set(seen)].join(',') || 'none';
};
async function newFolder(alice) {
  await alice.b.$('[aria-label="New folder"]').click();
  await browser.pause(300);
  await alice.b.keys('Enter');
  await alice.b.$('//span[normalize-space(.)="New folder"]').waitForDisplayed({ timeout: 5_000 });
  await browser.pause(300);
}

describe('phase one probes', () => {
  it('a Scripted user takes part in a group chat', async () => {
    await reset('groups');
    const alice = user('alice');
    const bob = user('bob');
    await alice.openChat('Weekend');
    await bob.openChat('Weekend');
    await bob.sees('Seeded group hello');
    const carol = await scripted('carol');
    await alice.send('Hi group');
    await bob.sees('Hi group');
    const start = performance.now();
    await carol.send('Weekend', 'Carol here');
    await alice.sees('Carol here');
    await bob.sees('Carol here');
    log(`scripted send seen by both in ${Math.round(performance.now() - start)} ms`);
    const page = await carol.client.query(carol.api.messages.list, {
      conversationId: await carol.chat('Weekend'),
      paginationOpts: { numItems: 10, cursor: null },
    });
    assert.ok(page.page.some((m) => m.body === 'Hi group'), 'Carol does not read what Alice wrote');
  });

  it('unread badge appears live and clears on open', async () => {
    await reset('friends');
    const alice = user('alice');
    const bob = user('bob');
    await bob.openChat('Alice Test');
    await bob.send('Are you there?');
    const badge = alice.b.$('span[title="1 unread messages"]');
    await badge.waitForDisplayed({ timeout: 10_000 });
    await alice.openChat('Bob Test');
    await badge.waitForDisplayed({ timeout: 10_000, reverse: true });
    log('unread badge ok');
  });

  it('presence shows the other user online', async () => {
    await reset('friends');
    const row = user('alice').b.$('button[title^="Bob Test ·"]');
    await row.waitForExist({ timeout: 10_000 });
    await browser.pause(1_500);
    log(`presence row title: ${await row.getAttribute('title')}`);
  });

  it('native drag into a folder', async () => {
    await reset('groups');
    const alice = user('alice');
    const me = await scripted('alice');
    await newFolder(alice);
    const row = alice.b.$('button[title^="Bob Test ·"]');
    const folder = alice.b.$('//span[normalize-space(.)="New folder"]');
    await spy(alice.b);
    try {
      await row.dragAndDrop(folder);
    } catch (e) {
      log(`dragAndDrop threw: ${e.message}`);
    }
    await browser.pause(1_500);
    log(`native drag events: ${await spied(alice.b)}`);
    log(`native drag: folder chats = ${JSON.stringify((await me.layout()).folders.map((f) => f.chatIds.length))}`);
  });

  it('synthetic drag events into a folder', async () => {
    await reset('groups');
    const alice = user('alice');
    const me = await scripted('alice');
    await newFolder(alice);
    const out = await alice.b.execute(async () => {
      const row = document.querySelector('button[title^="Bob Test ·"]');
      const target = [...document.querySelectorAll('section span')].find((s) => s.textContent.trim() === 'New folder');
      if (!row || !target) return `missing ${!!row} ${!!target}`;
      const dataTransfer = new DataTransfer();
      const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
      fire(row, 'dragstart');
      await new Promise((r) => setTimeout(r, 100));
      fire(target, 'dragover');
      await new Promise((r) => setTimeout(r, 100));
      fire(target, 'drop');
      fire(row, 'dragend');
      return 'fired';
    });
    await browser.pause(1_500);
    log(`synthetic drag ${out}: folder chats = ${JSON.stringify((await me.layout()).folders.map((f) => f.chatIds.length))}`);
  });

  it('native drag of a tab into a split pane', async () => {
    await reset('groups');
    const alice = user('alice');
    await alice.openChat('Weekend');
    await alice.openChat('Bob Test');
    const before = await composers(alice.b);
    const tab = alice.b.$('[draggable="true"].cursor-grab');
    const pane = alice.b.$('textarea[aria-label="Write a message…"]');
    await spy(alice.b);
    try {
      await tab.dragAndDrop(pane);
    } catch (e) {
      log(`tab dragAndDrop threw: ${e.message}`);
    }
    await browser.pause(1_000);
    log(`tab drag events: ${await spied(alice.b)}`);
    log(`tab split: composers ${before} -> ${await composers(alice.b)}`);
  });
});

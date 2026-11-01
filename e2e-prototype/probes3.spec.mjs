// PROTOTYPE, throwaway. Does the stub design hold? Facts for "Which Fixtures does phase two need?".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIXTURE_PNG, STUB_LOG } from './config.mjs';
import { reset, scripted, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);
const stubLog = () => fs.readFileSync(STUB_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const loaded = (b, css) => b.execute((s) => [...document.querySelectorAll(s)].map((i) => ({
  src: i.src.slice(0, 60), ok: i.complete && i.naturalWidth > 0,
})), css);

async function chatOpen(seed = 'friends') {
  await reset(seed);
  const alice = user('alice');
  const bob = user('bob');
  await alice.openChat('Bob Test');
  await bob.openChat('Alice Test');
  return { alice, bob };
}

describe('stub probes', () => {
  it('uploads through the hidden file input', async () => {
    const { alice, bob } = await chatOpen();
    const input = alice.b.$('input[type="file"]');
    try {
      await input.setValue(FIXTURE_PNG);
      log('hidden input: setValue accepted');
    } catch (e) {
      log(`hidden input setValue threw: ${e.message.split('\n')[0]}`);
    }
    await browser.pause(500);
    const staged = await alice.b.execute(() => document.querySelectorAll('img[src^="blob:"]').length);
    log(`staged previews after setValue: ${staged}`);
    if (staged === 0) {
      // Fallback: the same files array a real picker produces, through a synthetic change event.
      const png = fs.readFileSync(FIXTURE_PNG).toString('base64');
      await alice.b.execute((b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], 'pixel.png', { type: 'image/png' }));
        const el = document.querySelector('input[type="file"]');
        el.files = dt.files;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, png);
      await browser.pause(500);
      log(`staged previews after synthetic change: ${await alice.b.execute(() => document.querySelectorAll('img[src^="blob:"]').length)}`);
    }
    await alice.send('Photo caption');
    await bob.sees('Photo caption');
    await browser.pause(1_500);
    const imgs = await loaded(bob.b, 'img[src*="127.0.0.1:3312"]');
    log(`bob sees stub images: ${JSON.stringify(imgs)}`);
    const put = stubLog().filter((r) => r.method === 'PUT' && r.origin).length;
    log(`PUTs from the webview: ${put}, origin ${stubLog().find((r) => r.method === 'PUT' && r.origin)?.origin}`);
  });

  it('Convex reaches the stub when a message is deleted', async () => {
    await chatOpen('media');
    const alice = await scripted('alice');
    const conversationId = await alice.chat('Bob Test');
    const page = await alice.client.query(alice.api.messages.list, { conversationId, paginationOpts: { numItems: 10, cursor: null } });
    const message = page.page.find((m) => m.attachments.length > 0);
    assert.ok(message, 'Seeded attachment missing after Reset');
    log(`seeded attachment url: ${message.attachments[0].url.slice(0, 60)}`);
    const before = stubLog().filter((r) => r.method === 'DELETE').length;
    await alice.client.mutation(alice.api.messages.remove, { messageId: message._id });
    await browser.pause(2_000);
    log(`DELETEs reaching the stub: ${stubLog().filter((r) => r.method === 'DELETE').length - before}`);
  });

  it('a Seeded attachment and avatar survive a Reset', async () => {
    const { alice, bob } = await chatOpen('media');
    await bob.sees('Seeded photo');
    await browser.pause(1_500);
    log(`attachment after Reset: ${JSON.stringify(await loaded(bob.b, 'img[src*="127.0.0.1:3312"]'))}`);
    log(`avatar after Reset: ${JSON.stringify(await loaded(bob.b, 'img[src*="127.0.0.1:3310"]'))}`);
    await alice.sees('Seeded photo');
  });

  it('the GIF picker works against the stub', async () => {
    const { alice, bob } = await chatOpen();
    await alice.b.$('[aria-label="GIF"]').click();
    await browser.pause(1_000);
    const thumbs = await loaded(alice.b, 'img[src*="/thumb/"]');
    log(`picker thumbs: ${JSON.stringify(thumbs)}`);
    await alice.b.$('img[src*="/thumb/e2e1"]').click();
    await bob.b.$('img[src*="media.giphy.com/media/e2e1"]').waitForExist({ timeout: 10_000 });
    log('bob received the GIF with its giphy.com address');
    await alice.send('/giphy cats');
    await browser.pause(1_000);
    log(`GIF requests: ${stubLog().filter((r) => r.url.startsWith('/v1/gifs')).map((r) => r.url).join(' ')}`);
    log(`real giphy.com images on bob: ${JSON.stringify(await loaded(bob.b, 'img[src*="media.giphy.com"]'))}`);
  });

  it('a Seeded link preview shows without the network', async () => {
    const { alice, bob } = await chatOpen('media');
    await alice.send('https://example.invalid/page');
    await bob.sees('Seeded preview title');
    await alice.sees('Seeded preview title');
    log('Seeded preview shown to both');
  });
});

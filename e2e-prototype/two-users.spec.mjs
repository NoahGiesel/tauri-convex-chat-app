// PROTOTYPE, throwaway. A realistic two-user test, plus the probes the map asked this prototype to prove.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLOUD, FRIENDS_ROWS } from './config.mjs';
import { importSeed, loadApps, note, quiet, readRows, reset, restoreStorage, user } from './fixtures.mjs';

async function twoFriendsWithChatOpen() {
  const ready = performance.now();
  await reset('friends');
  const alice = user('alice');
  const bob = user('bob');
  await alice.openChat('Bob Test');
  await bob.openChat('Alice Test');
  note('fixture: two friends, chat open', performance.now() - ready);
  return { alice, bob };
}

const strip = (rows) => JSON.stringify(rows);
const snapshotRows = () => strip(JSON.parse(fs.readFileSync(FRIENDS_ROWS, 'utf8')));

describe('backend guard', () => {
  it('every instance was built for the Test backend', async () => {
    for (const name of ['alice', 'bob']) {
      const baked = await browser.getInstance(name).execute(() => window.__E2E__?.convexUrl ?? null);
      assert.equal(baked, CLOUD, `${name} is on ${baked}`);
    }
  });
});

describe('two friends chatting', () => {
  it('each sees the other message in realtime', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();

    await bob.sees('Seeded hello');

    const start = performance.now();
    await alice.send('Hi Bob');
    await bob.sees('Hi Bob');
    note('realtime: alice to bob seen', performance.now() - start);

    await bob.send('Hi Alice');
    await alice.sees('Hi Alice');
  });

  it('starts clean after the previous test', async () => {
    const { alice, bob } = await twoFriendsWithChatOpen();
    await alice.sees('Seeded hello');
    await bob.sees('Seeded hello');
    await alice.doesNotSee('Hi Bob');
    await alice.doesNotSee('Hi Alice');
    await bob.doesNotSee('Hi Bob');
    await bob.doesNotSee('Hi Alice');
  });
});

describe('Reset sequence', () => {
  it('a sign-out is undone by the next Reset', async () => {
    const { alice } = await twoFriendsWithChatOpen();
    await alice.signOut();
    await alice.seesAuthScreen();

    const again = await twoFriendsWithChatOpen();
    await again.alice.sees('Seeded hello');
  });

  it('settings left in localStorage do not survive', async () => {
    const alice = browser.getInstance('alice');
    await twoFriendsWithChatOpen();
    await alice.execute(() => localStorage.setItem('chat:lang', 'it'));
    await alice.refresh();
    await alice.$('textarea[aria-label="Scrivi un messaggio…"]').waitForDisplayed({ timeout: 5_000 }).catch(() => {});

    const { alice: fresh } = await twoFriendsWithChatOpen();
    await fresh.sees('Seeded hello');
    assert.equal(await alice.execute(() => localStorage.getItem('chat:lang')), null);
  });

  it('a signed-out instance can stay signed out', async () => {
    await reset('friends', { signedIn: ['alice'] });
    await user('bob').seesAuthScreen();
    await user('alice').openChat('Bob Test');
  });

  it('with apps quiet, nothing writes into the new data', async () => {
    await restoreStorage(['alice', 'bob']);
    await quiet();
    for (const name of ['alice', 'bob']) {
      assert.equal(await browser.getInstance(name).execute(() => location.href), 'about:blank');
    }
    await importSeed('friends');
    assert.equal(strip(readRows()), snapshotRows(), 'differs from the snapshot right after import');
    // Longer than the 45 s heartbeat, and the same window as the control below.
    await browser.pause(50_000);
    assert.equal(strip(readRows()), snapshotRows(), 'differs from the snapshot after 50 s');
    await loadApps();
  });

  it('control: an import under live apps, what do they write?', async () => {
    const { alice } = await twoFriendsWithChatOpen();
    await alice.sees('Seeded hello');
    await browser.pause(1_000);
    await importSeed('friends');
    const before = readRows();
    await browser.pause(50_000);
    const after = readRows();
    const same = strip(after) === strip(before);
    console.log(`[probe] live-app import: rows changed after import = ${!same}`);
    if (!same) {
      for (const table of Object.keys(after)) {
        for (const row of after[table]) {
          const old = before[table].find((r) => r._id === row._id);
          if (JSON.stringify(old) !== JSON.stringify(row)) console.log(`[probe] ${table} ${row._id}\n  before ${JSON.stringify(old)}\n  after  ${JSON.stringify(row)}`);
        }
      }
    }
  });
});

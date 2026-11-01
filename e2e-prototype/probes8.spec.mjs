// PROTOTYPE, throwaway. A soak for timeouts: realtime latency and Reset time, idle and under CPU load.
import { spawn } from 'node:child_process';
import os from 'node:os';
import { reset, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);
const IDLE = 40;
const LOADED = 20;

// Bob records when the text lands; Alice records the Enter press. Same machine, same clock.
const watch = (b, text) => b.execute((t) => {
  window.__seen = null;
  new MutationObserver((_, o) => {
    if (document.body.textContent.includes(t)) { window.__seen = Date.now(); o.disconnect(); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}, text);
const stamp = (b) => b.execute(() => {
  window.__pressed = null;
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.__pressed = Date.now(); }, { capture: true, once: true });
});

async function round(phase, i) {
  const start = performance.now();
  let step = 'reset';
  try {
    await reset('friends');
    const resetMs = Math.round(performance.now() - start);
    const alice = user('alice');
    const bob = user('bob');
    step = 'open alice';
    await alice.openChat('Bob Test');
    step = 'open bob';
    await bob.openChat('Alice Test');
    const fixtureMs = Math.round(performance.now() - start);

    const text = `Soak ${phase} ${i}`;
    await watch(bob.b, text);
    await stamp(alice.b);
    step = 'send';
    await alice.send(text);
    const spin = performance.now();
    step = 'bob sees';
    await bob.sees(text, 15_000);
    const pollMs = Math.round(performance.now() - spin);
    step = 'alice sees';
    await alice.sees(text, 15_000);
    const seen = await bob.b.execute(() => window.__seen);
    const pressed = await alice.b.execute(() => window.__pressed);
    log(`DATA ${JSON.stringify({ phase, i, resetMs, fixtureMs, realtimeMs: seen - pressed, pollMs })}`);
  } catch (e) {
    log(`FAIL ${JSON.stringify({ phase, i, step, ms: Math.round(performance.now() - start), error: e.message.split('\n')[0].slice(0, 120) })}`);
  }
}

describe('soak', () => {
  for (let i = 1; i <= IDLE; i++) it(`idle ${i}`, async () => round('idle', i));

  describe('under CPU load', () => {
    const burners = [];
    before(() => {
      for (let n = 0; n < os.cpus().length; n++) {
        burners.push(spawn(process.execPath, ['-e', 'for(;;);'], { stdio: 'ignore' }));
      }
      log(`burners: ${burners.length}`);
    });
    after(() => burners.forEach((p) => p.kill()));
    for (let i = 1; i <= LOADED; i++) it(`loaded ${i}`, async () => round('loaded', i));
  });

  for (const seed of ['friends', 'groups', 'media']) {
    it(`reset time on ${seed}`, async () => {
      const times = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await reset(seed);
        times.push(Math.round(performance.now() - start));
      }
      log(`RESET ${seed}: ${times.join(' ')}`);
    });
  }
});

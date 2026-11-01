// PROTOTYPE, throwaway. Can a dead instance stop the run, and can a failure leave screenshots?
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EXE, STAGE } from './config.mjs';
import { reset, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);
const image = path.basename(EXE);
const pids = () => execSync(`tasklist /FI "IMAGENAME eq ${image}" /FO CSV /NH`, { encoding: 'utf8' })
  .split('\n').map((l) => l.split('","')[1]).filter(Boolean);

describe('stopping a broken run', () => {
  beforeEach(async () => {
    for (const name of ['alice', 'bob']) {
      const start = performance.now();
      try {
        await user(name).b.execute(() => 1);
      } catch (e) {
        log(`ping ${name} failed after ${Math.round(performance.now() - start)} ms`);
        throw new Error(`App instance ${name} is gone, stopping the run: ${e.message.split('\n')[0].slice(0, 80)}`);
      }
    }
  });

  afterEach(async function shots() {
    if (this.currentTest.state !== 'failed') return;
    for (const name of ['alice', 'bob']) {
      const file = path.join(STAGE, `fail-${name}.png`);
      const start = performance.now();
      try {
        await user(name).b.saveScreenshot(file);
        log(`screenshot ${name}: ${fs.statSync(file).size} bytes in ${Math.round(performance.now() - start)} ms`);
      } catch (e) {
        log(`screenshot ${name} failed: ${e.message.split('\n')[0].slice(0, 100)}`);
      }
    }
  });

  it('a failing test leaves screenshots', async () => {
    await reset('friends');
    await user('alice').openChat('Bob Test');
    await user('alice').sees('This text never appears', 1_000);
  });

  it('bob dies', async () => {
    await reset('friends');
    const victims = pids();
    execSync(`taskkill /F /PID ${victims[victims.length - 1]}`);
  });

  for (const i of [1, 2, 3, 4, 5]) it(`later test ${i}`, async () => { log(`later test ${i} ran`); await reset('friends'); });
});

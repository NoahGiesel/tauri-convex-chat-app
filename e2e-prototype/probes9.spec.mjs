// PROTOTYPE, throwaway. What happens when an app instance dies in the middle of a run?
import { execSync } from 'node:child_process';
import path from 'node:path';
import { EXE } from './config.mjs';
import { reset, user } from './fixtures.mjs';

const log = (m) => console.log(`[probe] ${m}`);
const image = path.basename(EXE);
const pids = () => execSync(`tasklist /FI "IMAGENAME eq ${image}" /FO CSV /NH`, { encoding: 'utf8' })
  .split('\n').map((l) => l.split('","')[1]).filter(Boolean);

describe('crash', () => {
  it('healthy test', async () => {
    await reset('friends');
    await user('bob').openChat('Alice Test');
    log(`instances: ${pids().join(' ')}`);
  });

  it('bob dies mid test', async () => {
    const victims = pids();
    const pid = victims[victims.length - 1];
    execSync(`taskkill /F /PID ${pid}`);
    log(`killed ${pid}, left: ${pids().join(' ')}`);
    const start = performance.now();
    try {
      await user('bob').sees('Seeded hello', 5_000);
      log('bob call still worked');
    } catch (e) {
      log(`bob call failed after ${Math.round(performance.now() - start)} ms: ${e.message.split('\n')[0].slice(0, 140)}`);
    }
    const alice = performance.now();
    try {
      await user('alice').sees('Seeded hello', 5_000).catch(() => {});
      log(`alice call returned after ${Math.round(performance.now() - alice)} ms`);
    } catch (e) {
      log(`alice call failed: ${e.message.split('\n')[0].slice(0, 140)}`);
    }
  });

  it('next test runs a Reset', async () => {
    const start = performance.now();
    await reset('friends');
    log(`reset finished after ${Math.round(performance.now() - start)} ms`);
  });

  it('and the one after', async () => {
    const start = performance.now();
    await reset('friends');
    log(`second reset finished after ${Math.round(performance.now() - start)} ms`);
  });
});

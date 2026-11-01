// PROTOTYPE, throwaway. `pnpm e2e:proto` mirrors the decided `pnpm e2e` order:
// check ports, build, start backend, build Seeds, run WDIO, clean up even on failure.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  CLOUD, EXE, HERE, IDENTIFIER, PORTS, PROFILES, ROOT, SECRET, SITE, SNAPSHOTS, STAGE, TIMINGS_FILE,
  cleanEnv, convexDevProcess, convexSync,
} from './config.mjs';
import { buildSeeds } from './seeds.mjs';

const args = new Set(process.argv.slice(2));
const timings = [];
async function time(label, fn) {
  const start = performance.now();
  const out = await fn();
  const ms = Math.round(performance.now() - start);
  timings.push({ label, ms });
  console.log(`[harness] ${label}: ${ms} ms`);
  return out;
}

const portBusy = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });

async function waitFor(what, check, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if (await check()) return; } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function rmRetry(target) {
  for (let i = 0; i < 40; i++) {
    try { fs.rmSync(target, { recursive: true, force: true }); return; } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  console.warn(`[harness] could not delete ${target}`);
}

function buildApp() {
  const env = cleanEnv({
    VITE_CONVEX_URL: CLOUD,
    VITE_CONVEX_SITE_URL: SITE,
    VITE_E2E: '1',
  });
  const tauri = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  const res = spawnSync(
    process.execPath,
    [tauri, 'build', '--debug', '--no-bundle', '--features', 'e2e', '--config', JSON.stringify({ identifier: IDENTIFIER })],
    { cwd: ROOT, env, stdio: 'inherit' },
  );
  if (res.status !== 0) throw new Error(`tauri build failed with ${res.status}`);
  if (!fs.existsSync(EXE)) throw new Error(`no binary at ${EXE}`);
}

function makeStage() {
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });
  fs.cpSync(path.join(ROOT, 'convex'), path.join(STAGE, 'convex'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(STAGE, 'package.json'));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(STAGE, 'node_modules'), 'junction');
  // The Seed file is only ever copied here, never into the repo's convex/.
  fs.copyFileSync(path.join(HERE, 'stage-seed.ts'), path.join(STAGE, 'convex', 'e2eSeed.ts'));
}

/** Refuses to continue unless the CLI in the stage is bound to the anonymous local deployment. */
function assertStageIsLocal() {
  const envFile = fs.readFileSync(path.join(STAGE, '.env.local'), 'utf8');
  if (!envFile.includes('anonymous') || !envFile.includes('127.0.0.1:3310')) {
    throw new Error(`stage is not on the anonymous local deployment:\n${envFile}`);
  }
}

let dev;
let failed = false;
try {
  await time('ports free', async () => {
    for (const port of PORTS) if (await portBusy(port)) throw new Error(`port ${port} is busy, refusing to run`);
  });

  if (!args.has('--no-build')) await time('tauri build', async () => buildApp());

  await time('backend: start and push functions', async () => {
    makeStage();
    dev = convexDevProcess();
    let log = '';
    dev.stdout.on('data', (d) => { log += d; });
    dev.stderr.on('data', (d) => { log += d; });
    dev.once('exit', (code) => { if (code) console.error(`[harness] convex dev exited ${code}\n${log}`); });
    await waitFor('backend version endpoint', async () => (await fetch(`${CLOUD}/version`)).ok);
    await waitFor('.env.local in stage', async () => fs.existsSync(path.join(STAGE, '.env.local')));
    assertStageIsLocal();
    convexSync(['env', 'set', 'BETTER_AUTH_SECRET', SECRET]);
    await waitFor('auth routes', async () => (await fetch(`${SITE}/api/auth/ok`)).ok);
  });

  await time('seeds: total', async () => buildSeeds(time));
  console.log('[harness] snapshots:', fs.readdirSync(SNAPSHOTS).map((f) => `${f} ${fs.statSync(path.join(SNAPSHOTS, f)).size} bytes`).join(', '));

  await rmRetry(PROFILES);
  fs.mkdirSync(path.join(PROFILES, 'alice'), { recursive: true });
  fs.mkdirSync(path.join(PROFILES, 'bob'), { recursive: true });

  await time('wdio run', async () => {
    const wdio = path.join(ROOT, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js');
    const res = spawnSync(process.execPath, [wdio, 'run', path.join(HERE, 'wdio.conf.mjs')], {
      cwd: ROOT, env: cleanEnv(), stdio: 'inherit',
    });
    if (res.status !== 0) failed = true;
  });
} catch (err) {
  failed = true;
  console.error('[harness] FAILED:', err);
} finally {
  if (dev) dev.kill();
  await waitFor('backend to stop', async () => !(await portBusy(3310)), 15_000).catch((e) => console.warn(e.message));
  console.log('\n[harness] timings');
  for (const t of timings) console.log(`  ${String(t.ms).padStart(8)} ms  ${t.label}`);
  if (fs.existsSync(TIMINGS_FILE)) console.log(fs.readFileSync(TIMINGS_FILE, 'utf8'));
}
process.exit(failed ? 1 : 0);

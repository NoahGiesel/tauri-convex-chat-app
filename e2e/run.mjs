// `pnpm e2e`. The work happens here and not in wdio.conf, which is evaluated once per process.
// The order: check ports, build, start the Test backend, build Seeds, run WDIO, clean up even after a failure.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DRIVEN_USERS, E2E_DIR, EXE, FAILURES, IDENTIFIER, IS_MAC, PORTS, PROFILES, ROOT, SITE_URL, STAGE, STUB_URL, TEST_RAN_FILE, TEST_SECRET } from './config.mjs';
import { buildEnv, commandEnv, confirmStage, findBusyPorts, macVersionProblem, parseRunArgs } from './guards.mjs';
import { timingReport } from './report.mjs';
import { buildSeeds } from './seeds.mjs';
import { convexInStage, prepareStage, startBackend } from './stage.mjs';
import { ESPN_PREFIX, STUB_READY } from './stub.mjs';

let grep;
try {
  ({ grep } = parseRunArgs(process.argv.slice(2)));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (process.platform !== 'win32' && !IS_MAC) {
  // Instances are kept apart by a WebView2 setting on Windows and a WKWebView data store on macOS. Nothing does it elsewhere.
  console.error('pnpm e2e runs on Windows and macOS only. See docs/E2E-SPEC.md.');
  process.exit(1);
}
if (IS_MAC) {
  const version = spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim();
  const problem = macVersionProblem(version);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
}

const log = (message) => console.log(`[e2e] ${message}`);
const running = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function track(child) {
  running.add(child);
  child.once('exit', () => running.delete(child));
  return child;
}

/** Every process with its parent and command line, on macOS. */
function processTable() {
  const out = spawnSync('ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout;
  return out
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, pid, ppid, command]) => ({ pid: Number(pid), ppid: Number(ppid), command }));
}

/** On macOS the children of a killed process are not killed with it either: walk down from it and stop them all. */
function killTreeOnMac(rootPid) {
  const table = processTable();
  const doomed = [rootPid];
  for (let i = 0; i < doomed.length; i++) for (const p of table) if (p.ppid === doomed[i] && !doomed.includes(p.pid)) doomed.push(p.pid);
  for (const pid of doomed.reverse()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
}

/** On Windows, killing a process leaves its children alive, and they would keep the ports. */
function stopRunning() {
  for (const { pid } of running) {
    if (IS_MAC) killTreeOnMac(pid);
    else spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { env: commandEnv(), stdio: 'ignore' });
  }
}

/** Stops what a killed parent left behind, chosen by path so that an installed Chat is never touched. */
function stopLeftovers() {
  if (IS_MAC) {
    for (const { pid, command } of processTable()) {
      if (pid !== process.pid && (command.startsWith(EXE) || command.includes(STAGE))) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
    }
    return;
  }
  const script = `
    Get-CimInstance Win32_Process |
      Where-Object { $_.ProcessId -ne $PID -and ($_.ExecutablePath -eq $env:E2E_EXE -or ($_.CommandLine -and $_.CommandLine.Contains($env:E2E_STAGE))) } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: commandEnv({ E2E_EXE: EXE, E2E_STAGE: STAGE }),
    stdio: 'ignore',
  });
}

function runToEnd(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = track(spawn(command, args, options));
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(args[0])} exited with ${code}`))));
  });
}

async function waitFor(what, check, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function buildTestBuild() {
  const tauri = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  // On macOS the main window is not created from the configuration: the app builds it with a data store of its own per instance.
  // An array in a config patch replaces the whole array, so the window is repeated here with `create: false`.
  const windows = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')).app.windows;
  const config = JSON.stringify({ identifier: IDENTIFIER, ...(IS_MAC ? { app: { windows: windows.map((w) => ({ ...w, create: false })) } } : {}) });
  await runToEnd(process.execPath, [tauri, 'build', '--debug', '--no-bundle', '--features', 'e2e', '--config', config], {
    cwd: ROOT,
    env: buildEnv(),
    stdio: 'inherit',
  });
}

/** Gathers what a started process prints. `died` rejects with all of it if the process exits. */
function watch(what, child) {
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const died = new Promise((_, reject) => {
    child.once('exit', (code) => reject(new Error(`${what} exited with ${code}
${output}`)));
  });
  died.catch(() => {});
  const untilPrinted = (text, description) => Promise.race([waitFor(description, async () => output.includes(text)), died]);
  return { died, untilPrinted };
}

async function startTestBackend() {
  prepareStage();
  // Its own process: a Seed's CLI call blocks this one while Convex may be calling the stub.
  const stub = watch('the stub', track(spawn(process.execPath, [path.join(E2E_DIR, 'stub.mjs')], { cwd: E2E_DIR, env: commandEnv(), stdio: ['ignore', 'pipe', 'pipe'] })));
  await stub.untilPrinted(STUB_READY, 'the stub');
  const backend = watch('convex dev', track(startBackend()));

  // A write during the first push fails with an OCC error, so the variables below must wait for it.
  // Polling the auth routes instead would be an auth call before the secret exists.
  await backend.untilPrinted('Convex functions ready', 'the first function push');
  confirmStage(STAGE);

  // Before any auth call: with no secret, Better Auth silently uses a public default.
  convexInStage(['env', 'set', 'BETTER_AUTH_SECRET', TEST_SECRET]);
  fs.writeFileSync(path.join(STAGE, 'e2e.env'), [
    'R2_ACCOUNT_ID=e2e',
    'R2_ACCESS_KEY_ID=e2e',
    'R2_SECRET_ACCESS_KEY=e2e',
    'R2_BUCKET=e2e',
    `R2_ENDPOINT=${STUB_URL}`,
    // Also keeps the Test backend's own crons off live ESPN. A release stops if production sets it.
    `ESPN_BASE_URL=${STUB_URL}${ESPN_PREFIX}`,
  ].join('\n'));
  convexInStage(['env', 'set', '--from-file', 'e2e.env']);
  await Promise.race([waitFor('auth routes', async () => (await fetch(`${SITE_URL}/api/auth/ok`)).ok), backend.died]);
}

async function removeWithRetries(target) {
  for (let i = 0; i < 40; i++) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch {
      // WebView2 outlives the app by a moment and holds its folder until it exits (macOS: the WebKit processes).
      await sleep(250);
    }
  }
  throw new Error(`could not delete ${target}`);
}

async function makeProfiles() {
  await removeWithRetries(PROFILES);
  for (const name of DRIVEN_USERS) fs.mkdirSync(path.join(PROFILES, name), { recursive: true });
}

async function runTests() {
  const wdio = path.join(ROOT, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js');
  // As one argument: WDIO would read a value that starts with a dash as a flag of its own.
  const filter = grep ? [`--mochaOpts.grep=${grep}`] : [];
  await runToEnd(process.execPath, [wdio, 'run', path.join(E2E_DIR, 'wdio.conf.mjs'), ...filter], {
    // WDIO loads the .env in its working folder, and the repo root holds the developer's.
    cwd: E2E_DIR,
    env: commandEnv(),
    stdio: 'inherit',
  });
  // WDIO calls a run with nothing to do a success, and a mistyped test name must not look green.
  if (!fs.existsSync(TEST_RAN_FILE)) throw new Error(grep ? `no test matches "${grep}"` : 'no test ran');
}

async function cleanUp() {
  stopRunning();
  stopLeftovers();
  try {
    await waitFor('ports to be free', async () => (await findBusyPorts(PORTS)).length === 0, 15_000);
  } finally {
    await removeWithRetries(PROFILES);
  }
}

// This stops before the clean-up on purpose: what holds the port is not ours to stop.
const busy = await findBusyPorts(PORTS);
if (busy.length) {
  console.error(`[e2e] FAILED: port ${busy.join(', ')} is busy, so an old app or backend may be running`);
  process.exit(1);
}

const steps = [];
async function timed(name, step) {
  log(name);
  const start = Date.now();
  try {
    await step();
  } finally {
    steps.push({ name, ms: Date.now() - start });
  }
}

let failed = false;
process.on('SIGINT', () => {
  failed = true;
  stopRunning();
});

try {
  await removeWithRetries(FAILURES);
  await timed('building the Test build', buildTestBuild);
  await timed('starting the Test backend and the stub', startTestBackend);
  await timed('building Seeds', buildSeeds);
  await makeProfiles();
  await timed('running tests', runTests);
} catch (err) {
  failed = true;
  console.error(`[e2e] FAILED: ${err.message}`);
}

try {
  await timed('cleaning up', cleanUp);
} catch (err) {
  failed = true;
  const stillBusy = await findBusyPorts(PORTS);
  console.error(`[e2e] FAILED: ${err.message}${stillBusy.length ? `. Still busy: ${stillBusy.join(', ')}` : ''}`);
}

for (const line of timingReport(steps)) log(line);
if (fs.existsSync(FAILURES) && fs.readdirSync(FAILURES).length) log(`screenshots of what failed: ${FAILURES}`);

process.exit(failed ? 1 : 0);

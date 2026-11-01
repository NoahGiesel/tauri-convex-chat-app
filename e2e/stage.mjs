// The disposable folder that the Convex CLI runs from, so it only ever sees the Test backend.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BACKEND_VERSION, CONVEX_PORT, ROOT, SITE_PORT, SNAPSHOTS, STAGE, TEST_LIMIT_MS } from './config.mjs';
import { commandEnv, confirmStage } from './guards.mjs';

const CONVEX_BIN = path.join(ROOT, 'node_modules', 'convex', 'bin', 'main.js');

function removeStage(stage) {
  // The link goes first, so that deleting the stage cannot reach the real node_modules.
  const link = path.join(stage, 'node_modules');
  if (fs.lstatSync(link, { throwIfNoEntry: false })) fs.unlinkSync(link);
  fs.rmSync(stage, { recursive: true, force: true });
}

/** The Seed file is only ever copied here, never into the repo's `convex/`. */
export function prepareStage(root = ROOT, stage = STAGE) {
  removeStage(stage);
  fs.mkdirSync(stage, { recursive: true });
  fs.cpSync(path.join(root, 'convex'), path.join(stage, 'convex'), { recursive: true });
  fs.copyFileSync(path.join(root, 'package.json'), path.join(stage, 'package.json'));
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'junction');
  fs.copyFileSync(path.join(root, 'e2e', 'stage-seed.ts'), path.join(stage, 'convex', 'e2eSeed.ts'));
}

/** Starts the fresh anonymous deployment. `convex dev` writes `.env.local` in the stage, not in the repo. */
export function startBackend() {
  return spawn(
    process.execPath,
    [
      CONVEX_BIN, 'dev',
      '--local-cloud-port', String(CONVEX_PORT), '--local-site-port', String(SITE_PORT),
      '--local-backend-version', BACKEND_VERSION,
      '--typecheck', 'disable', '--tail-logs', 'disable',
    ],
    // Set here, after the developer's CONVEX_* variables are gone. It is what makes this anonymous.
    { cwd: STAGE, env: commandEnv({ CONVEX_AGENT_MODE: 'anonymous' }), stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/** Every other CLI call goes through here, so none can run before the stage is confirmed. */
export function convexInStage(args) {
  confirmStage(STAGE);
  // This blocks the event loop, so no test limit can fire while it runs. It needs its own.
  const res = spawnSync(process.execPath, [CONVEX_BIN, ...args], { cwd: STAGE, env: commandEnv(), encoding: 'utf8', timeout: TEST_LIMIT_MS });
  if (res.status !== 0) throw new Error(`convex ${args.join(' ')} failed\n${res.stdout}\n${res.stderr}`);
  return res;
}

/** Replaces everything on the Test backend with one Seed. */
export function importSeed(seed) {
  convexInStage(['import', '--replace-all', '--yes', path.join(SNAPSHOTS, `${seed}.zip`)]);
}

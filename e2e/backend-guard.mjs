// Step 1 of the release checklist, right before `npx convex deploy`. It stays this small for the same reason as release-guard.mjs.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { checkProductionBackend } from './release-check.mjs';

const CONVEX_BIN = path.join(ROOT, 'node_modules', 'convex', 'bin', 'main.js');
const getVar = (name) => spawnSync(process.execPath, [CONVEX_BIN, 'env', 'get', name, '--prod'], { cwd: ROOT, encoding: 'utf8' });

const problems = checkProductionBackend(getVar);
for (const problem of problems) console.error(`Backend guard: ${problem}`);
if (problems.length) process.exit(1);
console.log('Backend guard: production holds nothing reserved for tests.');

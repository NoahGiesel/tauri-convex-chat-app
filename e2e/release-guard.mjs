// A step of release.yml. It fails when the build would ship anything reserved for tests:
// the e2e feature keeps an unauthenticated WebDriver server in, and any local process could read the session token.
// It checks what the build uses, because the feature always exists in Cargo.toml.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const RESERVED_VARS = ['VITE_E2E', 'VITE_GIPHY_API_URL'];
const RESERVED_CRATE = /^tauri-plugin-wdio/m;

const unquote = (token) => token.replace(/^["']|["']$/g, '');

/** Reads the feature flags of `tauri build`, whose --features takes several values. */
function featuresIn(args) {
  const tokens = args.split(/\s+/).filter(Boolean).map(unquote);
  const features = [];
  let all = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--all-features') all = true;
    if (token.startsWith('--features=')) features.push(token.slice('--features='.length));
    if (token !== '--features' && token !== '-f') continue;
    while (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) features.push(tokens[++i]);
  }
  return { features: features.flatMap((value) => value.split(',')).filter(Boolean), all };
}

/** Every `args:` line counts, the matrix's and the build step's, so a release cannot name a feature out of sight. */
function requestedByWorkflow(workflow) {
  const lines = [...workflow.matchAll(/^[\s-]*args:\s*(.+)$/gm)].map(([, value]) => value.replace(/\$\{\{.*?\}\}/g, ' '));
  const requested = lines.map(featuresIn);
  return { features: requested.flatMap(({ features }) => features), all: requested.some(({ all }) => all) };
}

/** Cargo resolves the features, so `default` and a feature that turns on another count too. */
function shipsWebDriver(root, { features, all }) {
  const args = ['tree', '--locked', '--prefix', 'none', '--format', '{p}', '--manifest-path', path.join(root, 'src-tauri', 'Cargo.toml')];
  if (features.length) args.push('--features', features.join(','));
  if (all) args.push('--all-features');
  const res = spawnSync('cargo', args, { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(res.error?.message ?? res.stderr);
  return RESERVED_CRATE.test(res.stdout);
}

/** Returns what is wrong with the release at `root`. Empty means it holds nothing reserved for tests. */
export function checkRelease(root) {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const problems = [];

  const { features, all } = requestedByWorkflow(workflow);
  try {
    if (shipsWebDriver(root, { features: [...features, ...(tauriConfig.build?.features ?? [])], all })) {
      problems.push('the build enables the e2e feature, which ships an unauthenticated WebDriver server');
    }
  } catch (err) {
    // A guard that cannot look must not pass.
    problems.push(`could not read what cargo would build: ${err.message}`);
  }

  // Vite's own loader, in the mode `vite build` uses, so this sees the env files and variables the build sees.
  const seen = new Set(Object.keys(loadEnv('production', root, RESERVED_VARS)));
  // A variable set on the build step never reaches this step's environment.
  for (const name of RESERVED_VARS) {
    if (new RegExp(`^\\s*${name}\\s*:`, 'm').test(workflow)) seen.add(name);
  }
  for (const name of seen) problems.push(`the build sets ${name}, which belongs to the Test build alone`);

  return problems;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const problems = checkRelease(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  for (const problem of problems) console.error(`Release guard: ${problem}`);
  if (problems.length) process.exit(1);
  console.log('Release guard: this build holds nothing reserved for tests.');
}

// What the release guard looks at: it fails early on what a release names. The build itself is the last stop,
// because a text scan cannot see every route: `lib.rs` refuses the e2e feature and `vite.config.ts` the variables.
// The e2e feature keeps an unauthenticated WebDriver server in, and any local process could read the session token.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

const TEST_ONLY_VARS = ['VITE_E2E', 'VITE_GIPHY_API_URL'];
const WEBDRIVER_CRATE = /^tauri-plugin-wdio/m;

const unquote = (token) => token.replace(/^["']|["']$/g, '');

/** Reads the feature flags of `tauri build`, whose --features takes several values. */
function featuresIn(args) {
  const tokens = args.split(/\s+/).filter(Boolean).map(unquote);
  const features = [];
  let allFeatures = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--all-features') allFeatures = true;
    if (token.startsWith('--features=')) features.push(token.slice('--features='.length));
    if (token !== '--features' && token !== '-f') continue;
    while (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) features.push(tokens[++i]);
  }
  return { features: features.flatMap((value) => value.split(',')).filter(Boolean), allFeatures };
}

/** Every `args:` line counts, the matrix's and the build step's, so a release cannot name a feature out of sight. */
function requestedByWorkflow(workflow) {
  const argLines = [...workflow.matchAll(/^[\s-]*args:\s*(.+)$/gm)].map(([, value]) => value.replace(/\$\{\{.*?\}\}/g, ' '));
  const requested = argLines.map(featuresIn);
  return { features: requested.flatMap(({ features }) => features), allFeatures: requested.some(({ allFeatures }) => allFeatures) };
}

/** Cargo resolves the features, so `default` and a feature that turns on another count too. */
function shipsWebDriver(root, { features, allFeatures }) {
  const args = ['tree', '--prefix', 'none', '--format', '{p}', '--manifest-path', path.join(root, 'src-tauri', 'Cargo.toml')];
  if (features.length) args.push('--features', features.join(','));
  if (allFeatures) args.push('--all-features');
  const res = spawnSync('cargo', args, { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(res.error?.message ?? res.stderr);
  return WEBDRIVER_CRATE.test(res.stdout);
}

/** Returns what is wrong with the release at `root`. Empty means it holds nothing reserved for tests. */
export function checkRelease(root) {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const problems = [];

  const { features, allFeatures } = requestedByWorkflow(workflow);
  try {
    if (shipsWebDriver(root, { features: [...features, ...(tauriConfig.build?.features ?? [])], allFeatures })) {
      problems.push('the build enables the e2e feature, which ships an unauthenticated WebDriver server');
    }
  } catch (err) {
    // A guard that cannot look must not pass.
    problems.push(`could not read what cargo would build: ${err.message}`);
  }

  // Vite's own loader, in the mode `vite build` uses, so this sees the env files and variables the build sees.
  const viteEnv = loadEnv('production', root, 'VITE_');
  for (const name of TEST_ONLY_VARS) {
    // A variable set on the build step never reaches this step's environment.
    if (name in viteEnv || new RegExp(`^\\s*${name}\\s*:`, 'm').test(workflow)) {
      problems.push(`the build sets ${name}, which belongs to the Test build alone`);
    }
  }

  return problems;
}

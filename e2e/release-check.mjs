// What the release guard looks at: it fails early on what a release names. The build itself is the last stop,
// because a text scan cannot see every route: `lib.rs` refuses the e2e feature and `vite.config.ts` the variables.
// The e2e feature keeps an unauthenticated WebDriver server in, and any local process could read the session token.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

const TEST_ONLY_VARS = ['VITE_E2E', 'VITE_GIPHY_API_URL'];
const WEBDRIVER_CRATE = /^tauri-plugin-wdio/m;
/** Il deployment di produzione: una release che ne nomina un altro (il dev) non deve uscire. */
export const PRODUCTION_CONVEX_URL = 'https://avid-roadrunner-413.eu-west-1.convex.cloud';

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
export function checkRelease(root, env = process.env) {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const problems = [];

  // La build incorpora VITE_CONVEX_URL: se il secret punta al dev, l'app pubblicata legge e scrive i dati del dev.
  // release.yml passa il secret al passo che esegue la guardia, così il confronto non può essere saltato.
  const convexUrl = (env.VITE_CONVEX_URL ?? '').trim();
  if (convexUrl !== PRODUCTION_CONVEX_URL) {
    problems.push(`the build points the app at ${convexUrl || 'no deployment'} instead of production (${PRODUCTION_CONVEX_URL})`);
  }
  const guardAt = workflow.indexOf('node e2e/release-guard.mjs');
  const guardStep = guardAt < 0 ? '' : workflow.slice(Math.max(0, guardAt - 400), guardAt);
  if (!/VITE_CONVEX_URL:\s*\$\{\{\s*secrets\.VITE_CONVEX_URL\s*\}\}/.test(guardStep)) {
    problems.push('the guard step does not receive VITE_CONVEX_URL, so it cannot tell which deployment the build points at');
  }

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

/** Backend variables that point Convex at the E2E stub. Production must set none of them. */
const STUB_ONLY_BACKEND_VARS = ['ESPN_BASE_URL'];

/**
 * Returns what is wrong with the production backend. release.yml cannot see Convex's variables, so this runs
 * before `npx convex deploy`. `getVar(name)` runs `convex env get <name> --prod` and returns spawnSync's result:
 * an unset variable prints nothing and exits 0.
 */
export function checkProductionBackend(getVar) {
  const problems = [];
  for (const name of STUB_ONLY_BACKEND_VARS) {
    const res = getVar(name);
    // A guard that cannot look must not pass.
    if (res.error || res.status !== 0) problems.push(`could not read ${name} on production: ${(res.error?.message ?? res.stderr ?? '').trim()}`);
    else if (res.stdout.trim()) problems.push(`production sets ${name}, which points the backend at the E2E stub`);
  }
  return problems;
}

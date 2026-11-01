// The checks that keep the suite away from real data. Each one stops the run.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { CONVEX_URL, DEPLOYMENT, EXE, PROFILES, SITE_URL, STUB_URL } from './config.mjs';

/** The developer's environment is not inherited: `convex import --replace-all` wipes whatever it reaches. */
export function commandEnv(extra = {}, base = process.env) {
  const env = { ...base };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('CONVEX_')) delete env[key];
  return { ...env, ...extra };
}

/** Vite reads `.env` files, and only variables set here win over them. */
export function buildEnv(base = process.env) {
  const env = commandEnv({}, base);
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('VITE_')) delete env[key];
  delete env.CARGO_TARGET_DIR;
  return {
    ...env,
    VITE_CONVEX_URL: CONVEX_URL,
    VITE_CONVEX_SITE_URL: SITE_URL,
    VITE_E2E: '1',
    VITE_GIPHY_API_URL: `${STUB_URL}/v1/gifs`,
    VITE_GIPHY_API_KEY: 'e2e-fake-key',
  };
}

const canBind = (port, host) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });

/** Both addresses, because on Windows binding one succeeds while something listens on the other. */
export async function findBusyPorts(ports) {
  const busy = [];
  for (const port of ports) {
    if (!(await canBind(port, '127.0.0.1')) || !(await canBind(port, '0.0.0.0'))) busy.push(port);
  }
  return busy;
}

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const vars = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(\S*)/);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

/**
 * Must pass before any Seed or Reset. The CLI acts on what this file names, and it reuses an
 * anonymous deployment from the home folder if one has the same name, so the data must be in the stage.
 */
export function confirmStage(stage) {
  // The CLI writes the VITE_ names here because the stage's package.json has Vite.
  const { CONVEX_DEPLOYMENT, VITE_CONVEX_URL, VITE_CONVEX_SITE_URL } = readEnvFile(path.join(stage, '.env.local'));
  if (CONVEX_DEPLOYMENT !== DEPLOYMENT || VITE_CONVEX_URL !== CONVEX_URL || VITE_CONVEX_SITE_URL !== SITE_URL) {
    throw new Error(`${stage} is not the Test backend: it names ${CONVEX_DEPLOYMENT ?? 'no deployment'} at ${VITE_CONVEX_URL ?? 'no URL'}`);
  }
  if (!fs.existsSync(path.join(stage, '.convex', 'local', 'default', 'config.json'))) {
    throw new Error(`${DEPLOYMENT} keeps its data outside the stage, so it may not be a fresh Test backend`);
  }
}

/** `report` is what the running app published in `window.__E2E__`. */
export function confirmInstance(name, report) {
  if (report?.convexUrl !== CONVEX_URL || report?.siteUrl !== SITE_URL) {
    throw new Error(`${name} is not on the Test backend: it reports ${JSON.stringify(report) ?? 'nothing'}`);
  }
}

/** A Test build with no profile of its own could reach a real session, so the folder must already exist. */
export function instanceCapability(name, profiles = PROFILES) {
  const profile = path.join(profiles, name);
  if (!fs.existsSync(profile)) throw new Error(`no profile for ${name} at ${profile}. Start the suite with pnpm e2e`);
  return {
    capabilities: {
      browserName: 'tauri',
      'tauri:options': { application: EXE },
      'wdio:tauriServiceOptions': { env: { WEBVIEW2_USER_DATA_FOLDER: profile } },
    },
  };
}

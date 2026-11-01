// PROTOTYPE, throwaway. Evaluated in the launcher and again in each worker, so no side effects here.
import path from 'node:path';
import { EXE, HERE, PROFILES } from './config.mjs';

const cap = (name) => ({
  capabilities: {
    browserName: 'tauri',
    'tauri:options': { application: EXE },
    'wdio:tauriServiceOptions': { env: { WEBVIEW2_USER_DATA_FOLDER: path.join(PROFILES, name) } },
  },
});

export const config = {
  runner: 'local',
  specs: [path.join(HERE, 'two-users.spec.mjs')],
  maxInstances: 1,
  services: [['@wdio/tauri-service', { driverProvider: 'embedded', embeddedPort: 4540 }]],
  capabilities: { alice: cap('alice'), bob: cap('bob') },
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120_000 },
  logLevel: 'warn',
  waitforTimeout: 10_000,
};

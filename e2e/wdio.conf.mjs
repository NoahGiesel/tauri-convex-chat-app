// Evaluated in the launcher and again in each worker, so it has no side effects. `pnpm e2e` does the work.
import { DRIVEN_USERS, FIRST_INSTANCE_PORT } from './config.mjs';
import { instanceCapability } from './guards.mjs';

export const config = {
  runner: 'local',
  specs: ['./specs/**/*.spec.mjs'],
  maxInstances: 1,
  services: [['@wdio/tauri-service', { driverProvider: 'embedded', embeddedPort: FIRST_INSTANCE_PORT }]],
  capabilities: Object.fromEntries(DRIVEN_USERS.map((name) => [name, instanceCapability(name)])),
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 30_000 },
  logLevel: 'warn',
  waitforTimeout: 5_000,
};

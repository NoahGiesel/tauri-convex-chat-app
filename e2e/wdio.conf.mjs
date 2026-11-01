// Evaluated in the launcher and again in each worker, so it has no side effects. `pnpm e2e` does the work.
import { DRIVEN_USERS, FIRST_INSTANCE_PORT, INTERFACE_WAIT_MS } from './config.mjs';
import { confirmCleanEnv, instanceCapability } from './guards.mjs';

confirmCleanEnv();

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
  waitforTimeout: INTERFACE_WAIT_MS,
};

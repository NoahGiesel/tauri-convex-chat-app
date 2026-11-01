// Evaluated in the launcher and again in each worker, so it has no side effects. `pnpm e2e` does the work.
import { DRIVEN_USERS, FIRST_INSTANCE_PORT, INTERFACE_WAIT_MS, TEST_LIMIT_MS } from './config.mjs';
import { confirmCleanEnv, instanceCapability } from './guards.mjs';
import { saveScreenshots } from './report.mjs';

confirmCleanEnv();

export const config = {
  runner: 'local',
  // One group, so one worker and one pair of apps: a dead instance stops the run, and no spec file restarts it.
  specs: [['./specs/**/*.spec.mjs']],
  maxInstances: 1,
  services: [['@wdio/tauri-service', { driverProvider: 'embedded', embeddedPort: FIRST_INSTANCE_PORT }]],
  capabilities: Object.fromEntries(DRIVEN_USERS.map((name) => [name, instanceCapability(name)])),
  framework: 'mocha',
  reporters: ['spec'],
  // No retries: a retry would hide a flaky test, and a flaky test is a bug.
  specFileRetries: 0,
  mochaOpts: { ui: 'bdd', timeout: TEST_LIMIT_MS, retries: 0 },
  logLevel: 'warn',
  waitforTimeout: INTERFACE_WAIT_MS,
  afterTest: async (test, _context, { passed }) => {
    if (!passed) await saveScreenshots(browser, `${test.parent} ${test.title}`);
  },
};

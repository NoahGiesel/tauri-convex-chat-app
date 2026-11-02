// Polling for what the harness reads outside the app: queries and the stub's log. A wait in the app uses WebdriverIO's own.
import { INTERFACE_WAIT_MS, POLL_MS } from './config.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits as long as a Driven user would. `timeoutMsg` may be a function, to name what was last seen. */
export async function waitUntil(check, timeoutMsg) {
  const end = Date.now() + INTERFACE_WAIT_MS;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(typeof timeoutMsg === 'function' ? timeoutMsg() : timeoutMsg);
    await sleep(POLL_MS);
  }
}

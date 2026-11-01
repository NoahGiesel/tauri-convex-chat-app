// A step of release.yml. It stays this small so that no entry check can skip it and pass by saying nothing.
import { ROOT } from './config.mjs';
import { checkRelease } from './release-check.mjs';

const problems = checkRelease(ROOT);
for (const problem of problems) console.error(`Release guard: ${problem}`);
if (problems.length) process.exit(1);
console.log('Release guard: this build holds nothing reserved for tests.');

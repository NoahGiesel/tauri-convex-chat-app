// What a run tells the developer. `pnpm e2e:guards` runs this file.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { screenshotName, timingReport } from './report.mjs';

describe('the timings of a run', () => {
  const steps = [
    { name: 'Test build', ms: 16_400 },
    { name: 'tests', ms: 62_000 },
  ];

  it('lists each step and the total', () => {
    const report = timingReport(steps).join('\n');
    assert.match(report, /Test build\s+16\.4 s/);
    assert.match(report, /tests\s+62\.0 s/);
    assert.match(report, /total\s+78\.4 s/);
  });

  it('gives no warning within 10 minutes', () => {
    assert.doesNotMatch(timingReport([{ name: 'tests', ms: 600_000 }]).join('\n'), /WARNING/);
  });

  it('warns over 10 minutes', () => {
    assert.match(timingReport([{ name: 'tests', ms: 600_001 }]).join('\n'), /WARNING: the run took 600\.0 s, over the 10 minutes it should stay under/);
  });
});

describe('a failure screenshot', () => {
  it('is named after the test and the instance', () => {
    assert.equal(screenshotName('two friends chatting each sees the other message', 'alice'), 'two-friends-chatting-each-sees-the-other-message-alice.png');
  });

  it('holds nothing a file name cannot', () => {
    assert.equal(screenshotName('shows "/me": a <quote>?', 'bob'), 'shows-me-a-quote-bob.png');
  });

  it('keeps a long title short enough for Windows', () => {
    assert.ok(screenshotName('a'.repeat(300), 'alice').length <= 100);
  });
});

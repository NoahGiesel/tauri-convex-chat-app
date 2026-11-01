// What the release guard refuses. `pnpm e2e:guards` runs this file.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { ROOT } from './config.mjs';
import { commandEnv } from './guards.mjs';
import { checkRelease } from './release-guard.mjs';

const GUARD = path.join(ROOT, 'e2e', 'release-guard.mjs');
const WORKFLOW = path.join('.github', 'workflows', 'release.yml');
const CARGO = path.join('src-tauri', 'Cargo.toml');
const TAURI_CONFIG = path.join('src-tauri', 'tauri.conf.json');

const temps = [];
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

/** A copy of what the guard reads, so a test can change one file of a release. */
function releaseCopy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-guard-'));
  temps.push(root);
  fs.mkdirSync(path.join(root, 'src-tauri', 'src'), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, WORKFLOW)), { recursive: true });
  for (const file of [WORKFLOW, CARGO, TAURI_CONFIG, path.join('src-tauri', 'Cargo.lock')]) {
    fs.copyFileSync(path.join(ROOT, file), path.join(root, file));
  }
  fs.writeFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), '');
  return root;
}

function change(root, file, edit) {
  const target = path.join(root, file);
  const before = fs.readFileSync(target, 'utf8');
  const after = edit(before);
  assert.notEqual(after, before, `the test changed nothing in ${file}`);
  fs.writeFileSync(target, after);
}

describe('a release build', () => {
  let root;
  beforeEach(() => {
    root = releaseCopy();
  });

  it('passes when it is a normal one, although the e2e feature exists', () => {
    assert.match(fs.readFileSync(path.join(root, CARGO), 'utf8'), /^e2e = /m);
    assert.deepEqual(checkRelease(root), []);
  });

  for (const [what, args] of [
    ['--features e2e', '--target universal-apple-darwin --features e2e'],
    ['--features=e2e', '--features=e2e'],
    ['-f e2e', '-f e2e'],
    ['e2e among other features', '--features custom-protocol,e2e'],
    ['--all-features', '--all-features'],
  ]) {
    it(`fails when its arguments ask for ${what}`, () => {
      change(root, WORKFLOW, (text) => text.replace('args: ""', `args: ${args}`));
      if (args.includes('custom-protocol')) change(root, CARGO, (text) => text.replace('[features]', '[features]\ncustom-protocol = []'));
      assert.match(checkRelease(root).join('\n'), /e2e feature/);
    });
  }

  it('fails when the step that builds asks for the feature itself', () => {
    change(root, WORKFLOW, (text) => text.replace('args: ${{ matrix.args }}', 'args: ${{ matrix.args }} --features e2e'));
    assert.match(checkRelease(root).join('\n'), /e2e feature/);
  });

  it('fails when the feature is on by default', () => {
    change(root, CARGO, (text) => text.replace('[features]', '[features]\ndefault = ["e2e"]'));
    assert.match(checkRelease(root).join('\n'), /e2e feature/);
  });

  it('fails when another feature turns it on', () => {
    change(root, CARGO, (text) => text.replace('[features]', '[features]\ndefault = ["testing"]\ntesting = ["e2e"]'));
    assert.match(checkRelease(root).join('\n'), /e2e feature/);
  });

  it('fails when the Tauri config asks for the feature', () => {
    change(root, TAURI_CONFIG, (text) => text.replace('"build": {', '"build": {\n    "features": ["e2e"],'));
    assert.match(checkRelease(root).join('\n'), /e2e feature/);
  });

  for (const name of ['VITE_E2E', 'VITE_GIPHY_API_URL']) {
    it(`fails when the workflow sets ${name}`, () => {
      change(root, WORKFLOW, (text) => text.replace('          VITE_GIPHY_API_KEY:', `          ${name}: "1"\n          VITE_GIPHY_API_KEY:`));
      assert.match(checkRelease(root).join('\n'), new RegExp(name));
    });

    it(`fails when an env file that Vite reads sets ${name}`, () => {
      fs.writeFileSync(path.join(root, '.env.production'), `${name}=1\n`);
      assert.match(checkRelease(root).join('\n'), new RegExp(name));
    });
  }

  it('does not count a name that only a comment mentions', () => {
    change(root, WORKFLOW, (text) => text.replace('jobs:', '# VITE_E2E: never set this\njobs:'));
    assert.deepEqual(checkRelease(root), []);
  });

  it('fails, rather than passes, when it cannot tell what cargo would build', () => {
    change(root, CARGO, (text) => text.replace('[features]', '[features'));
    assert.match(checkRelease(root).join('\n'), /could not read/);
  });
});

describe('the release workflow', () => {
  const steps = fs.readFileSync(path.join(ROOT, WORKFLOW), 'utf8');

  it('runs the guard before the step that builds and publishes', () => {
    const guard = steps.indexOf('node e2e/release-guard.mjs');
    assert.ok(guard > 0, 'the guard is not in the workflow');
    assert.ok(guard < steps.indexOf('tauri-apps/tauri-action'));
    assert.ok(guard > steps.indexOf('pnpm install'), 'the guard needs Vite');
  });
});

describe('the guard as a command', () => {
  const run = (extra) => spawnSync(process.execPath, [GUARD], { cwd: ROOT, encoding: 'utf8', env: commandEnv(extra) });

  it('exits 0 for the release as it stands', () => {
    const res = run({});
    assert.equal(res.status, 0, res.stderr);
  });

  for (const name of ['VITE_E2E', 'VITE_GIPHY_API_URL']) {
    it(`exits 1 and names ${name} when the build environment sets it`, () => {
      const res = run({ [name]: '1' });
      assert.equal(res.status, 1);
      assert.match(res.stderr, new RegExp(name));
    });
  }
});

// What the release guard refuses. `pnpm e2e:guards` runs this file.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ROOT } from './config.mjs';
import { commandEnv } from './guards.mjs';
import { checkRelease } from './release-check.mjs';

const GUARD = path.join(ROOT, 'e2e', 'release-guard.mjs');
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const WORKFLOW = path.join('.github', 'workflows', 'release.yml');
const CARGO = path.join('src-tauri', 'Cargo.toml');
const TAURI_CONFIG = path.join('src-tauri', 'tauri.conf.json');
const TEST_ONLY_VARS = ['VITE_E2E', 'VITE_GIPHY_API_URL'];

const temps = [];
// checkRelease reads this process's variables, as the release step does.
before(() => {
  for (const name of TEST_ONLY_VARS) delete process.env[name];
});
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
  const original = fs.readFileSync(target, 'utf8');
  const edited = edit(original);
  assert.notEqual(edited, original, `the test changed nothing in ${file}`);
  fs.writeFileSync(target, edited);
}

const addFeatures = (root, lines) => change(root, CARGO, (text) => text.replace('[features]', `[features]\n${lines}`));
const complaints = (root) => checkRelease(root).join('\n');

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
    ['--all-features', '--all-features'],
  ]) {
    it(`fails when its arguments ask for ${what}`, () => {
      change(root, WORKFLOW, (text) => text.replace('args: ""', `args: ${args}`));
      assert.match(complaints(root), /e2e feature/);
    });
  }

  it('fails when e2e is one of several features', () => {
    addFeatures(root, 'extra = []');
    change(root, WORKFLOW, (text) => text.replace('args: ""', 'args: --features extra,e2e'));
    assert.match(complaints(root), /e2e feature/);
  });

  it('fails when the step that builds asks for the feature itself', () => {
    change(root, WORKFLOW, (text) => text.replace('args: ${{ matrix.args }}', 'args: ${{ matrix.args }} --features e2e'));
    assert.match(complaints(root), /e2e feature/);
  });

  it('fails when the feature is on by default', () => {
    addFeatures(root, 'default = ["e2e"]');
    assert.match(complaints(root), /e2e feature/);
  });

  it('fails when another feature turns it on', () => {
    addFeatures(root, 'default = ["testing"]\ntesting = ["e2e"]');
    assert.match(complaints(root), /e2e feature/);
  });

  it('fails when the Tauri config asks for the feature', () => {
    change(root, TAURI_CONFIG, (text) => text.replace('"build": {', '"build": {\n    "features": ["e2e"],'));
    assert.match(complaints(root), /e2e feature/);
  });

  for (const name of TEST_ONLY_VARS) {
    it(`fails when the workflow sets ${name}`, () => {
      change(root, WORKFLOW, (text) => text.replace('          VITE_GIPHY_API_KEY:', `          ${name}: "1"\n          VITE_GIPHY_API_KEY:`));
      assert.match(complaints(root), new RegExp(name));
    });

    it(`fails when an env file that Vite reads sets ${name}`, () => {
      fs.writeFileSync(path.join(root, '.env.production'), `${name}=1\n`);
      assert.match(complaints(root), new RegExp(name));
    });
  }

  it('does not count a longer name that only starts the same way', () => {
    fs.writeFileSync(path.join(root, '.env.production'), 'VITE_E2E_NOTES=1\n');
    assert.deepEqual(checkRelease(root), []);
  });

  it('does not count a name that only a comment mentions', () => {
    change(root, WORKFLOW, (text) => text.replace('jobs:', '# VITE_E2E: never set this\njobs:'));
    assert.deepEqual(checkRelease(root), []);
  });

  it('fails, rather than passes, when it cannot tell what cargo would build', () => {
    change(root, CARGO, (text) => text.replace('[features]', '[features'));
    assert.match(complaints(root), /could not read/);
  });
});

describe('the release workflow', () => {
  const workflow = fs.readFileSync(path.join(ROOT, WORKFLOW), 'utf8');

  it('runs the guard before the step that builds and publishes', () => {
    const guard = workflow.indexOf('node e2e/release-guard.mjs');
    assert.ok(guard > 0, 'the guard is not in the workflow');
    assert.ok(guard < workflow.indexOf('tauri-apps/tauri-action'));
    assert.ok(guard > workflow.indexOf('pnpm install'), 'the guard needs Vite');
  });
});

describe('the guard as a command', () => {
  const run = (extra) => spawnSync(process.execPath, [GUARD], { cwd: ROOT, encoding: 'utf8', env: commandEnv(extra) });

  it('exits 0 for the release as it stands', () => {
    const res = run({});
    assert.equal(res.status, 0, res.stderr);
  });

  for (const name of TEST_ONLY_VARS) {
    it(`exits 1 and names ${name} when the build environment sets it`, () => {
      const res = run({ [name]: '1' });
      assert.equal(res.status, 1);
      assert.match(res.stderr, new RegExp(name));
    });
  }
});

describe('the build itself', () => {
  for (const name of TEST_ONLY_VARS) {
    it(`stops at Vite when ${name} is set, whatever route it took`, () => {
      const res = spawnSync(process.execPath, [VITE, 'build'], { cwd: ROOT, encoding: 'utf8', env: commandEnv({ [name]: '1' }) });
      assert.notEqual(res.status, 0);
      assert.match(res.stderr, new RegExp(`${name} belongs to the Test build alone`));
    });
  }

  it('holds the compiler stop for a release profile with the e2e feature', () => {
    const lib = fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'lib.rs'), 'utf8');
    assert.match(lib, /#\[cfg\(all\(feature = "e2e", not\(debug_assertions\)\)\)\]\s+compile_error!/);
  });
});

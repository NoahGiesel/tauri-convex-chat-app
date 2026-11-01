// The rules that keep the suite away from real data. `pnpm e2e:guards` runs this file.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildEnv, commandEnv, confirmStage, findBusyPorts, confirmInstance, instanceCapability } from './guards.mjs';
import { prepareStage } from './stage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// What the CLI really writes, comment and blank lines included.
const LOCAL_ENV = [
  '# Deployment used by `npx convex dev`',
  'CONVEX_DEPLOYMENT=anonymous:anonymous-agent',
  '',
  'VITE_CONVEX_URL=http://127.0.0.1:3310',
  '',
  'VITE_CONVEX_SITE_URL=http://127.0.0.1:3311',
].join('\n');

const temps = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-guards-'));
  temps.push(dir);
  return dir;
};
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the target', () => {
  it('takes no flags, so none can change it', () => {
    const res = spawnSync(process.execPath, [path.join(ROOT, 'e2e', 'run.mjs'), '--url', 'https://example.convex.cloud'], {
      encoding: 'utf8',
    });
    assert.equal(res.status, 1);
    assert.match(res.stderr, /takes no flags/);
  });
});

describe('the environment a command gets', () => {
  it('drops every CONVEX_* variable, in any case', () => {
    const env = commandEnv({}, { CONVEX_DEPLOYMENT: 'prod:real', Convex_Deploy_Key: 'real', PATH: 'kept' });
    assert.deepEqual(env, { PATH: 'kept' });
  });

  it('keeps what the suite sets itself', () => {
    assert.deepEqual(commandEnv({ CONVEX_AGENT_MODE: 'anonymous' }, { CONVEX_AGENT_MODE: 'other' }), {
      CONVEX_AGENT_MODE: 'anonymous',
    });
  });
});

describe('the Test build', () => {
  it('points at the Test backend, whatever the developer has set', () => {
    const env = buildEnv({ VITE_CONVEX_URL: 'https://real.convex.cloud', CONVEX_URL: 'https://real.convex.cloud' });
    assert.equal(env.VITE_CONVEX_URL, 'http://127.0.0.1:3310');
    assert.equal(env.VITE_CONVEX_SITE_URL, 'http://127.0.0.1:3311');
    assert.equal(env.VITE_E2E, '1');
    assert.equal(env.CONVEX_URL, undefined);
  });

  it('drops VITE_* variables the suite does not set', () => {
    assert.equal(buildEnv({ VITE_SOMETHING_NEW: 'real' }).VITE_SOMETHING_NEW, undefined);
  });

  it('cannot be sent to another target folder, which would leave an old binary in place', () => {
    assert.equal(buildEnv({ CARGO_TARGET_DIR: 'C:\\elsewhere' }).CARGO_TARGET_DIR, undefined);
  });

  it('sets every VITE_* variable the app reads, so Vite takes none from a .env file', () => {
    const env = buildEnv({});
    const read = new Set();
    for (const entry of fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })) {
      const file = path.join(ROOT, 'src', entry);
      if (!/\.tsx?$/.test(file) || file.endsWith('.d.ts')) continue;
      for (const [, name] of fs.readFileSync(file, 'utf8').matchAll(/import\.meta\.env\.(VITE_\w+)/g)) read.add(name);
    }
    assert.ok(read.has('VITE_CONVEX_URL'), 'the scan found nothing');
    for (const name of read) assert.ok(env[name], `${name} is not set by the suite`);
  });
});

describe('a busy port', () => {
  let server;
  afterEach(() => server?.close());

  it('is reported', async () => {
    server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    assert.deepEqual(await findBusyPorts([port]), [port]);
  });

  it('is not reported once it is free', async () => {
    server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    assert.deepEqual(await findBusyPorts([port]), []);
  });
});

describe('the stage', () => {
  let stage;
  beforeEach(() => {
    stage = tempDir();
    fs.mkdirSync(path.join(stage, '.convex', 'local', 'default'), { recursive: true });
    fs.writeFileSync(path.join(stage, '.convex', 'local', 'default', 'config.json'), '{}');
  });

  it('is confirmed when it holds the anonymous deployment on the fixed port', () => {
    fs.writeFileSync(path.join(stage, '.env.local'), LOCAL_ENV);
    assert.doesNotThrow(() => confirmStage(stage));
  });

  for (const [what, text] of [
    ['a cloud deployment', LOCAL_ENV.replace('anonymous:anonymous-agent', 'prod:real-animal-123')],
    ['a dev cloud deployment', LOCAL_ENV.replace('anonymous:anonymous-agent', 'dev:real-animal-123')],
    ['another local deployment', LOCAL_ENV.replace('anonymous:anonymous-agent', 'local:local-team-chat')],
    ['a cloud URL', LOCAL_ENV.replace('http://127.0.0.1:3310', 'https://real-animal-123.convex.cloud')],
    ['another port', LOCAL_ENV.replace('127.0.0.1:3310', '127.0.0.1:3210')],
    ['a cloud site URL', LOCAL_ENV.replace('http://127.0.0.1:3311', 'https://real-animal-123.convex.site')],
    ['a match only inside a comment', LOCAL_ENV.replace('CONVEX_DEPLOYMENT=', '# CONVEX_DEPLOYMENT=')],
    ['nothing', ''],
  ]) {
    it(`is refused when it names ${what}`, () => {
      fs.writeFileSync(path.join(stage, '.env.local'), text);
      assert.throws(() => confirmStage(stage), /not the Test backend/);
    });
  }

  it('is refused when it has no .env.local', () => {
    assert.throws(() => confirmStage(stage), /not the Test backend/);
  });

  it('is refused when the deployment keeps its data outside the stage', () => {
    fs.writeFileSync(path.join(stage, '.env.local'), LOCAL_ENV);
    fs.rmSync(path.join(stage, '.convex'), { recursive: true });
    assert.throws(() => confirmStage(stage), /outside the stage/);
  });
});

describe('preparing the stage', () => {
  let root;
  let stage;
  beforeEach(() => {
    root = tempDir();
    stage = path.join(root, 'e2e', '.stage');
    fs.mkdirSync(path.join(root, 'convex'));
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    fs.mkdirSync(path.join(root, 'e2e'));
    fs.writeFileSync(path.join(root, 'convex', 'schema.ts'), 'schema');
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'index.js'), 'real');
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    fs.writeFileSync(path.join(root, 'e2e', 'stage-seed.ts'), 'seed');
  });

  it('puts the Seed file in the stage and leaves the repo convex folder alone', () => {
    prepareStage(root, stage);
    assert.equal(fs.readFileSync(path.join(stage, 'convex', 'e2eSeed.ts'), 'utf8'), 'seed');
    assert.equal(fs.readFileSync(path.join(stage, 'convex', 'schema.ts'), 'utf8'), 'schema');
    assert.deepEqual(fs.readdirSync(path.join(root, 'convex')), ['schema.ts']);
  });

  it('starts from nothing, and does not reach through its node_modules link', () => {
    prepareStage(root, stage);
    fs.writeFileSync(path.join(stage, 'left-by-the-last-run'), 'old');
    prepareStage(root, stage);
    assert.equal(fs.existsSync(path.join(stage, 'left-by-the-last-run')), false);
    assert.equal(fs.readFileSync(path.join(root, 'node_modules', 'pkg', 'index.js'), 'utf8'), 'real');
    assert.equal(fs.readFileSync(path.join(stage, 'node_modules', 'pkg', 'index.js'), 'utf8'), 'real');
  });

  it('never holds Seed code in the real convex folder', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'convex', 'e2eSeed.ts')), false);
  });
});

describe('a running instance', () => {
  const good = { convexUrl: 'http://127.0.0.1:3310', siteUrl: 'http://127.0.0.1:3311' };

  it('passes when it reports the Test backend', () => {
    assert.doesNotThrow(() => confirmInstance('alice', good));
  });

  for (const [what, report] of [
    ['reports nothing', undefined],
    ['reports null', null],
    ['is missing the Convex URL', { siteUrl: good.siteUrl }],
    ['is missing the site URL', { convexUrl: good.convexUrl }],
    ['reports a cloud URL', { ...good, convexUrl: 'https://real-animal-123.convex.cloud' }],
    ['reports a cloud site URL', { ...good, siteUrl: 'https://real-animal-123.convex.site' }],
    ['reports a loopback lookalike', { ...good, convexUrl: 'http://127.0.0.1.example.com:3310' }],
    ['reports another port', { ...good, convexUrl: 'http://127.0.0.1:3210' }],
  ]) {
    it(`stops the run when it ${what}`, () => {
      assert.throws(() => confirmInstance('bob', report), /bob is not on the Test backend/);
    });
  }
});

describe('an instance profile', () => {
  let profiles;
  beforeEach(() => {
    profiles = tempDir();
    fs.mkdirSync(path.join(profiles, 'alice'));
  });

  it('becomes the WebView2 folder of that instance', () => {
    const cap = instanceCapability('alice', profiles);
    assert.equal(cap.capabilities['wdio:tauriServiceOptions'].env.WEBVIEW2_USER_DATA_FOLDER, path.join(profiles, 'alice'));
  });

  it('is required: an instance with none refuses to start', () => {
    assert.throws(() => instanceCapability('bob', profiles), /no profile for bob/);
  });
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readStubLog, startStub } from './stub.mjs';

const APP = 'http://tauri.localhost';
let dir;
let stub;
let base;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-stub-'));
  stub = await startStub({ root: path.join(dir, 'files'), logFile: path.join(dir, 'log.jsonl'), port: 0 });
  base = `http://127.0.0.1:${stub.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => stub.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

const put = (key, body, type) => fetch(`${base}/e2e/${key}?X-Amz-Signature=any`, { method: 'PUT', headers: { 'content-type': type, origin: APP }, body });

describe('the R2 stub', () => {
  it('serves what was put, with its type, and ignores the signature', async () => {
    assert.equal((await put('chat/a.jpg', 'photo bytes', 'image/jpeg')).status, 200);

    const res = await fetch(`${base}/e2e/chat/a.jpg?X-Amz-Signature=other`, { headers: { origin: APP } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(await res.text(), 'photo bytes');
  });

  it('answers a browser preflight for an upload', async () => {
    const res = await fetch(`${base}/e2e/chat/a.jpg`, {
      method: 'OPTIONS',
      headers: { origin: APP, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' },
    });
    assert.equal(res.status, 204);
    assert.match(res.headers.get('access-control-allow-methods'), /PUT/);
    assert.equal(res.headers.get('access-control-allow-headers'), '*');
  });

  it('has nothing for a key never put', async () => {
    assert.equal((await fetch(`${base}/e2e/chat/missing.jpg`)).status, 404);
  });

  it('only logs a delete, so the file outlives it', async () => {
    await put('chat/a.jpg', 'photo bytes', 'image/jpeg');

    assert.equal((await fetch(`${base}/e2e/chat/a.jpg`, { method: 'DELETE' })).status, 204);

    assert.equal((await fetch(`${base}/e2e/chat/a.jpg`)).status, 200);
    assert.deepEqual(
      readStubLog(path.join(dir, 'log.jsonl')).filter(({ method }) => method === 'DELETE'),
      [{ method: 'DELETE', path: '/e2e/chat/a.jpg' }],
    );
  });

  it('refuses to start on a busy port', async () => {
    await assert.rejects(
      startStub({ root: path.join(dir, 'other'), logFile: path.join(dir, 'other.jsonl'), port: stub.address().port }),
      /EADDRINUSE/,
    );
  });
});

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

describe('the stub', () => {
  it('serves what was put, with its type, and ignores the signature', async () => {
    assert.equal((await put('chat/a.jpg', 'photo bytes', 'image/jpeg')).status, 200);

    const res = await fetch(`${base}/e2e/chat/a.jpg?X-Amz-Signature=other`, { headers: { origin: APP } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(await res.text(), 'photo bytes');
  });

  it('answers a range request with the part asked for, which WebKit needs to read a video', async () => {
    await put('chat/clip.mp4', '0123456789', 'video/mp4');
    const url = `${base}/e2e/chat/clip.mp4?X-Amz-Signature=any`;

    const first = await fetch(url, { headers: { range: 'bytes=0-3' } });
    assert.equal(first.status, 206);
    assert.equal(first.headers.get('content-range'), 'bytes 0-3/10');
    assert.equal(first.headers.get('accept-ranges'), 'bytes');
    assert.equal(await first.text(), '0123');

    const rest = await fetch(url, { headers: { range: 'bytes=7-' } });
    assert.equal(rest.status, 206);
    assert.equal(await rest.text(), '789');

    const last = await fetch(url, { headers: { range: 'bytes=-2' } });
    assert.equal(await last.text(), '89');

    assert.equal((await fetch(url, { headers: { range: 'bytes=50-' } })).status, 416);
    assert.equal(await (await fetch(url)).text(), '0123456789');
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

  it('returns canned trending GIFs, whose thumbnails it serves', async () => {
    const res = await fetch(`${base}/v1/gifs/trending?api_key=any&limit=24`, { headers: { origin: APP } });
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    const { data } = await res.json();

    assert.deepEqual(data.map(({ title }) => title), ['Trending 1', 'Trending 2', 'Trending 3']);
    assert.equal(data[0].images.fixed_height.url, 'https://media.giphy.com/media/trending-1/giphy.gif');
    const thumb = await fetch(data[0].images.fixed_width_small.url);
    assert.equal(thumb.headers.get('content-type'), 'image/gif');
    assert.equal(Buffer.from(await thumb.arrayBuffer()).subarray(0, 6).toString(), 'GIF89a');
  });

  it('returns canned search results named after the search', async () => {
    const { data } = await (await fetch(`${base}/v1/gifs/search?api_key=any&q=Happy%20cats&lang=en`)).json();

    assert.deepEqual(data.map(({ title }) => title), ['Happy cats 1', 'Happy cats 2', 'Happy cats 3']);
    assert.equal(data[1].images.fixed_height.url, 'https://media.giphy.com/media/happy-cats-2/giphy.gif');
  });

  it('refuses to start on a busy port', async () => {
    await assert.rejects(
      startStub({ root: path.join(dir, 'other'), logFile: path.join(dir, 'other.jsonl'), port: stub.address().port }),
      /EADDRINUSE/,
    );
  });
});

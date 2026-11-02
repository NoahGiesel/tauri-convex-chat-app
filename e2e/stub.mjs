// The local stand-in for R2, so a run needs no account and no internet. It checks no signatures.
// `pnpm e2e` starts it as a process of its own, because Seeds block their own process while Convex calls out.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUB_FILES, STUB_LOG, STUB_PORT } from './config.mjs';

export const STUB_READY = 'stub ready';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
};

/** One JSON line per request, oldest first. A test checks a deletion here. */
export function readStubLog(logFile = STUB_LOG) {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

/** Resolves once it listens on loopback, and rejects if the port is busy. */
export function startStub({ root = STUB_FILES, logFile = STUB_LOG, port = STUB_PORT } = {}) {
  fs.mkdirSync(root, { recursive: true });
  // The path is the bucket and the key. The query holds only the signature.
  const fileFor = (pathname) => path.join(root, encodeURIComponent(pathname));

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://stub');
    fs.appendFileSync(logFile, `${JSON.stringify({ method: req.method, path: pathname })}\n`);
    const send = (status, headers = {}, body = '') => {
      res.writeHead(status, { ...CORS, ...headers });
      res.end(body);
    };

    if (req.method === 'OPTIONS') return send(204);
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        fs.writeFileSync(fileFor(pathname), Buffer.concat(chunks));
        fs.writeFileSync(`${fileFor(pathname)}.type`, req.headers['content-type'] ?? 'application/octet-stream');
        send(200);
      });
      return undefined;
    }
    if (req.method === 'GET') {
      if (!fs.existsSync(fileFor(pathname))) return send(404);
      return send(200, { 'content-type': fs.readFileSync(`${fileFor(pathname)}.type`, 'utf8') }, fs.readFileSync(fileFor(pathname)));
    }
    // Only logged: a Reset can bring back a message whose file was deleted, and the file must still be there.
    if (req.method === 'DELETE') return send(204);
    return send(405);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startStub().then(
    () => console.log(STUB_READY),
    (err) => {
      console.error(`the stub could not start: ${err.message}`);
      process.exit(1);
    },
  );
}

// PROTOTYPE, throwaway. One local stand-in for R2 and GIPHY on a fixed loopback port. It checks no signatures.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [, , root, logFile] = process.argv;
fs.mkdirSync(root, { recursive: true });
const fileFor = (url) => path.join(root, encodeURIComponent(url.split('?')[0]));
// 1x1 transparent GIF, so previews really load.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
};

const gifs = (term) => ({
  data: [1, 2, 3].map((i) => ({
    id: `e2e${i}`,
    title: `${term} ${i}`,
    images: {
      fixed_height: { url: `https://media.giphy.com/media/e2e${i}/giphy.gif`, width: '100', height: '100' },
      fixed_width_small: { url: `http://127.0.0.1:3312/thumb/e2e${i}.gif`, width: '100', height: '100' },
    },
  })),
});

http.createServer((req, res) => {
  fs.appendFileSync(logFile, `${JSON.stringify({ method: req.method, url: req.url.split('?')[0], origin: req.headers.origin ?? null })}\n`);
  const send = (status, headers, body) => { res.writeHead(status, { ...cors, ...headers }); res.end(body); };
  const pathname = req.url.split('?')[0];

  if (req.method === 'OPTIONS') return send(204, {});
  if (pathname.startsWith('/v1/gifs/')) {
    const term = new URL(req.url, 'http://x').searchParams.get('q') ?? 'trending';
    return send(200, { 'content-type': 'application/json' }, JSON.stringify(gifs(term)));
  }
  if (pathname.startsWith('/thumb/')) return send(200, { 'content-type': 'image/gif' }, GIF);

  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      fs.writeFileSync(fileFor(req.url), Buffer.concat(chunks));
      fs.writeFileSync(`${fileFor(req.url)}.type`, req.headers['content-type'] ?? 'application/octet-stream');
      send(200, {}, '');
    });
    return undefined;
  }
  if (req.method === 'GET') {
    if (!fs.existsSync(fileFor(req.url))) return send(404, {}, '');
    return send(200, { 'content-type': fs.readFileSync(`${fileFor(req.url)}.type`, 'utf8') }, fs.readFileSync(fileFor(req.url)));
  }
  // A Reset can bring back a message whose file was deleted, so DELETE is only logged.
  if (req.method === 'DELETE') return send(204, {});
  return send(405, {}, '');
}).listen(3312, '127.0.0.1');

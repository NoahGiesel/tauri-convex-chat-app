// The local stand-in for R2, GIPHY and ESPN, so a run needs no account, no key and no internet. It checks no signatures.
// `pnpm e2e` starts it as a process of its own, because Seeds block their own process while Convex calls out.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUB_FILES, STUB_LOG, STUB_PORT } from './config.mjs';
import { ESPN_PREFIX, UNAVAILABLE_LEAGUE, espnLiveSummary, espnScoreboard, espnTeamEndpoint, espnTeamList, footballMatches, TEAMS } from './football.mjs';

/** What the `football` Seed and the Fixtures read, from the same canned data the stub serves. */
export { ESPN_PREFIX, espnEvent, footballMatches, LIVE_DETAILS, SEEDED_MATCHES, SEEDED_PINS, TEAMS as FOOTBALL_TEAMS, UNAVAILABLE_LEAGUE } from './football.mjs';

export const STUB_READY = 'stub ready';

const ESPN_ROUTE = new RegExp(`^${ESPN_PREFIX}/site/v2/sports/soccer/([^/]+)/(teams|scoreboard|summary)$`);
const ESPN_TEAM_ROUTE = new RegExp(`^${ESPN_PREFIX}/site/v2/sports/soccer/all/teams/([^/]+)$`);

/**
 * ESPN, from the canned data: team lists, each team's next match, scoreboards and the live match's summary.
 * The unavailable league and its teams answer 503, so the Test backend's crons can never refresh that match.
 * Returns [status, body], or null when the path is not ESPN's.
 */
function espnResponse(pathname, searchParams, matches) {
  const team = ESPN_TEAM_ROUTE.exec(pathname);
  if (team) {
    const known = Object.values(TEAMS).find((t) => t.id === team[1]);
    if (known?.league === UNAVAILABLE_LEAGUE) return [503, { error: 'unavailable' }];
    const body = espnTeamEndpoint(team[1], matches);
    return body ? [200, body] : [404, { error: 'no such team' }];
  }
  const route = ESPN_ROUTE.exec(pathname);
  if (!route) return pathname.startsWith(`${ESPN_PREFIX}/`) ? [404, { error: 'no such route' }] : null;
  const [, league, kind] = route;
  if (kind === 'teams') return [200, espnTeamList(league)];
  if (league === UNAVAILABLE_LEAGUE) return [503, { error: 'unavailable' }];
  if (kind === 'scoreboard') return [200, espnScoreboard(league, matches)];
  // Only the live match is ever polled successfully, so only it has a summary.
  return searchParams.get('event') === matches.live.eventId ? [200, espnLiveSummary(matches)] : [404, { error: 'no summary' }];
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
};

// A 1 by 1 GIF, so a thumbnail in the picker really loads.
const THUMBNAIL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/** The three results for a search, or with none, the trending ones. */
export const gifTitles = (search = '') => [1, 2, 3].map((i) => `${search || 'Trending'} ${i}`);
const gifId = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
/** A sent GIF keeps a giphy.com address, because `messages.sendGif` accepts no other. So a test checks this address. */
export const gifAddress = (title) => `https://media.giphy.com/media/${gifId(title)}/giphy.gif`;

function giphyResponse(search, host) {
  return {
    data: gifTitles(search).map((title) => ({
      id: gifId(title),
      title,
      images: {
        fixed_height: { url: gifAddress(title), width: '100', height: '100' },
        fixed_width_small: { url: `http://${host}/thumb/${gifId(title)}.gif`, width: '100', height: '100' },
      },
    })),
  };
}

/** One JSON line per request, oldest first. A test checks a deletion here. */
export function readStubLog(logFile = STUB_LOG) {
  if (!fs.existsSync(logFile)) return [];
  return fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

/** Resolves once it listens on loopback, and rejects if the port is busy. */
export function startStub({ root = STUB_FILES, logFile = STUB_LOG, port = STUB_PORT, now = Date.now() } = {}) {
  fs.mkdirSync(root, { recursive: true });
  // The path is the bucket and the key. The query holds only the signature.
  const fileFor = (pathname) => path.join(root, encodeURIComponent(pathname));
  // Kick-offs are fixed when the stub starts, so a live match's kick-off does not move between polls.
  const matches = footballMatches(now);

  const server = http.createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://stub');
    fs.appendFileSync(logFile, `${JSON.stringify({ method: req.method, path: pathname })}\n`);
    const send = (status, headers = {}, body = '') => {
      res.writeHead(status, { ...CORS, ...headers });
      res.end(body);
    };

    if (req.method === 'OPTIONS') return send(204);
    const espn = req.method === 'GET' ? espnResponse(pathname, searchParams, matches) : null;
    if (espn) return send(espn[0], { 'content-type': 'application/json' }, JSON.stringify(espn[1]));
    if (req.method === 'GET' && (pathname === '/v1/gifs/trending' || pathname === '/v1/gifs/search')) {
      const search = pathname.endsWith('/search') ? (searchParams.get('q') ?? '') : '';
      return send(200, { 'content-type': 'application/json' }, JSON.stringify(giphyResponse(search, req.headers.host)));
    }
    if (req.method === 'GET' && pathname.startsWith('/thumb/')) return send(200, { 'content-type': 'image/gif' }, THUMBNAIL);
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
      const type = fs.readFileSync(`${fileFor(pathname)}.type`, 'utf8');
      const body = fs.readFileSync(fileFor(pathname));
      // WebKit reads a video's length only through partial responses, and R2 gives them, so the stub does too.
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(body.length - Number(range[2]), 0);
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        if (start >= body.length || start > end) return send(416, { 'content-range': `bytes */${body.length}` });
        return send(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${body.length}` }, body.subarray(start, end + 1));
      }
      return send(200, { 'content-type': type, 'accept-ranges': 'bytes' }, body);
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

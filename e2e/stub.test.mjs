import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as espn from '../convex/espn.ts';
import {
  ESPN_PREFIX,
  FINISHED_DETAILS,
  FINISHED_MATCH,
  FOOTBALL_TEAMS,
  LIVE_DETAILS,
  readStubLog,
  SEEDED_SCHEDULES,
  SEEDED_STANDINGS,
  startStub,
  UNAVAILABLE_LEAGUE,
} from './stub.mjs';

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

// Read through the app's own ESPN client, so the canned data cannot drift from what the backend parses.
describe('the stub as ESPN', () => {
  const NOW = Date.parse('2026-11-08T18:00:00Z');
  let previousBase;

  beforeEach(async () => {
    await new Promise((resolve) => stub.close(resolve));
    stub = await startStub({ root: path.join(dir, 'espn'), logFile: path.join(dir, 'espn.jsonl'), port: 0, now: NOW });
    previousBase = process.env.ESPN_BASE_URL;
    process.env.ESPN_BASE_URL = `http://127.0.0.1:${stub.address().port}${ESPN_PREFIX}`;
  });
  afterEach(() => {
    if (previousBase === undefined) delete process.env.ESPN_BASE_URL;
    else process.env.ESPN_BASE_URL = previousBase;
  });

  it('lists the teams of every competition the index reads, nations included', async () => {
    const serieA = await espn.fetchTeamList('ita.1');
    assert.ok(serieA.some((team) => team.name === FOOTBALL_TEAMS.inter.name));
    const nations = await espn.fetchTeamList(espn.NATIONAL_TEAMS_LEAGUE);
    assert.deepEqual(nations.map((team) => team.name), [FOOTBALL_TEAMS.italy.name, FOOTBALL_TEAMS.spain.name]);
    for (const { league } of espn.CLUB_COMPETITIONS) await espn.fetchTeamList(league);
  });

  it('gives Inter its live match, the derby to both sides, and no match to Atalanta', async () => {
    const live = await espn.fetchNextMatch(FOOTBALL_TEAMS.inter.id);
    assert.equal(live.state, 'in');
    assert.deepEqual(live.score, { home: 1, away: 0 });
    assert.equal(live.kickoff, NOW - 35 * 60_000);

    const derby = await espn.fetchNextMatch(FOOTBALL_TEAMS.milan.id);
    assert.equal((await espn.fetchNextMatch(FOOTBALL_TEAMS.juventus.id)).eventId, derby.eventId);
    assert.equal(derby.state, 'pre');
    assert.equal(await espn.fetchNextMatch(FOOTBALL_TEAMS.atalanta.id), null);
  });

  it('serves the live match on its scoreboard, with a summary for the drawer', async () => {
    const [day] = espn.espnDays(NOW);
    const board = await espn.fetchScoreboard('ita.1', day);
    const live = board.find((match) => match.home.teamId === FOOTBALL_TEAMS.inter.id && match.state === 'in');
    assert.ok(live);

    const details = espn.parseSummary(await (await fetch(`${process.env.ESPN_BASE_URL}/site/v2/sports/soccer/ita.1/summary?event=${live.eventId}`)).json());
    assert.equal(details.venue, LIVE_DETAILS.venue);
    assert.deepEqual(
      details.events.map((e) => [e.kind, e.player]),
      [
        ['goal', LIVE_DETAILS.scorer],
        ['yellowCard', LIVE_DETAILS.booked],
        ['substitution', LIVE_DETAILS.substitute],
      ],
    );
    assert.deepEqual(details.lineups.map((l) => l.starters.length), [11, 11]);
    assert.equal(details.stats.length, 6);
  });

  it('gives the live match a place on the pitch for every starter, and a bench a test can read', async () => {
    const [day] = espn.espnDays(NOW);
    const board = await espn.fetchScoreboard('ita.1', day);
    const live = board.find((match) => match.home.teamId === FOOTBALL_TEAMS.inter.id && match.state === 'in');
    const details = espn.parseSummary(await (await fetch(`${process.env.ESPN_BASE_URL}/site/v2/sports/soccer/ita.1/summary?event=${live.eventId}`)).json());

    for (const lineup of details.lineups) {
      assert.ok(lineup.starters.every((p) => p.row !== undefined && p.order !== undefined), `${lineup.side} has a starter without a place`);
    }
    // The scorer and the substitute are linked to the events by their ESPN id.
    const scorer = details.lineups.flatMap((l) => [...l.starters, ...l.bench]).find((p) => p.name === LIVE_DETAILS.scorer);
    assert.ok(details.events.some((e) => e.kind === 'goal' && e.playerId === scorer.athleteId));
    const substitute = details.lineups.flatMap((l) => l.bench).find((p) => p.name === LIVE_DETAILS.substitute);
    assert.ok(substitute && substitute.row === undefined, 'a player who came on is on the bench');
    assert.ok(details.events.some((e) => e.kind === 'substitution' && e.playerId === substitute.athleteId && e.other === LIVE_DETAILS.replaced));
  });

  it('serves the schedule of Inter, AC Milan and Juventus, read by the app parser', async () => {
    for (const team of ['inter', 'milan', 'juventus']) {
      const results = await espn.fetchSchedule(FOOTBALL_TEAMS[team].id, 'results');
      const fixtures = await espn.fetchSchedule(FOOTBALL_TEAMS[team].id, 'fixtures');
      assert.ok(results.matches.length > 0, `${team} has no results`);
      assert.ok(fixtures.matches.length > 0, `${team} has no fixtures`);
      assert.ok(results.matches.every((m) => m.state === 'post'));
      assert.ok(fixtures.matches.every((m) => m.state === 'pre'));
    }
    // The three competitions of Inter, the ones the drawer's chips show.
    const results = await espn.fetchSchedule(FOOTBALL_TEAMS.inter.id, 'results');
    const fixtures = await espn.fetchSchedule(FOOTBALL_TEAMS.inter.id, 'fixtures');
    assert.deepEqual([...new Set([...results.competitions, ...fixtures.competitions].map((c) => c.league))].sort(), [...SEEDED_STANDINGS].sort());
  });

  it("serves the finished match a test opens from the Matches tab, and its summary", async () => {
    const results = await espn.fetchSchedule(FOOTBALL_TEAMS.inter.id, 'results');
    const opened = results.matches.find((m) => m.eventId === FINISHED_MATCH.eventId);
    assert.ok(opened);
    assert.deepEqual(opened.score, { home: FINISHED_MATCH.score[0], away: FINISHED_MATCH.score[1] });
    assert.equal(opened.opponent.name, FOOTBALL_TEAMS[FINISHED_MATCH.away].name);

    const details = espn.parseSummary(await (await fetch(`${process.env.ESPN_BASE_URL}/site/v2/sports/soccer/all/summary?event=${FINISHED_MATCH.eventId}`)).json());
    assert.equal(details.venue, FINISHED_DETAILS.venue);
    assert.deepEqual(
      details.events.map((e) => [e.kind, e.player]),
      [['goal', FINISHED_DETAILS.scorer]],
    );
  });

  it('serves the table of Serie A and the Champions League, and none for the Coppa Italia', async () => {
    const serieA = await espn.fetchStandings('ita.1');
    assert.equal(serieA.season, '2026-27 Italian Serie A');
    assert.equal(serieA.groups.length, 1);
    assert.deepEqual(
      serieA.groups[0].rows.map((r) => r.teamId),
      ['110', '103', '111', '114', '105', '112', '2572'],
    );
    assert.deepEqual(serieA.groups[0].rows[0].zone, { color: '0078FF', label: 'Champions League' });

    const champions = await espn.fetchStandings('uefa.champions');
    assert.equal(champions.groups[0].rows[0].teamId, FOOTBALL_TEAMS.inter.id);

    const coppa = await espn.fetchStandings('ita.coppa_italia');
    assert.deepEqual(coppa.groups, []);
  });

  it('fails the unavailable league and its teams, standings included, so their match never refreshes', async () => {
    await assert.rejects(espn.fetchScoreboard(UNAVAILABLE_LEAGUE, '20261108'), /HTTP 503/);
    await assert.rejects(espn.fetchNextMatch(FOOTBALL_TEAMS.realMadrid.id), /HTTP 503/);
    await assert.rejects(espn.fetchSchedule(FOOTBALL_TEAMS.realMadrid.id, 'results'), /HTTP 503/);
    await assert.rejects(espn.fetchStandings(UNAVAILABLE_LEAGUE), /HTTP 503/);
    assert.ok((await espn.fetchTeamList(UNAVAILABLE_LEAGUE)).length > 0); // the index still lists its teams
  });
});

// The canned ESPN data that the stub serves and the `football` Seed is built from, so the two cannot disagree.
// Kick-offs are relative to `now`: the stub fixes it when it starts, and the Seed when it is built.
// No logos, so a crest shows its initials and no run asks the internet for an image.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The stub answers this league's scoreboard, and its teams' next match, with an error, so that match never refreshes. */
export const UNAVAILABLE_LEAGUE = 'esp.1';
/** The prefix of the stub's ESPN routes, so they never meet R2's bucket paths. */
export const ESPN_PREFIX = '/espn';

/** Real ESPN ids, because the search's aliases ("inter", "italia") are keyed by them. */
export const TEAMS = {
  inter: { id: '110', name: 'Internazionale', shortName: 'Inter', abbreviation: 'INT', league: 'ita.1' },
  como: { id: '2572', name: 'Como', shortName: 'Como', abbreviation: 'COMO', league: 'ita.1' },
  milan: { id: '103', name: 'AC Milan', shortName: 'Milan', abbreviation: 'MIL', league: 'ita.1' },
  juventus: { id: '111', name: 'Juventus', shortName: 'Juventus', abbreviation: 'JUV', league: 'ita.1' },
  napoli: { id: '114', name: 'Napoli', shortName: 'Napoli', abbreviation: 'NAP', league: 'ita.1' },
  lazio: { id: '112', name: 'Lazio', shortName: 'Lazio', abbreviation: 'LAZ', league: 'ita.1' },
  atalanta: { id: '105', name: 'Atalanta', shortName: 'Atalanta', abbreviation: 'ATA', league: 'ita.1' },
  arsenal: { id: '359', name: 'Arsenal', shortName: 'Arsenal', abbreviation: 'ARS', league: 'eng.1' },
  chelsea: { id: '363', name: 'Chelsea', shortName: 'Chelsea', abbreviation: 'CHE', league: 'eng.1' },
  realMadrid: { id: '86', name: 'Real Madrid', shortName: 'Real Madrid', abbreviation: 'RMA', league: 'esp.1' },
  barcelona: { id: '83', name: 'Barcelona', shortName: 'Barcelona', abbreviation: 'BAR', league: 'esp.1' },
  italy: { id: '162', name: 'Italy', shortName: 'Italy', abbreviation: 'ITA', league: 'fifa.friendly' },
  spain: { id: '164', name: 'Spain', shortName: 'Spain', abbreviation: 'ESP', league: 'fifa.friendly' },
};

/**
 * Every match a run knows, by name. `home` and `away` are keys of TEAMS.
 * The FT, postponed and unavailable ones are each a pinned team's last or next match, which the Seed writes itself.
 */
export function footballMatches(now) {
  return {
    live: { eventId: '900001', home: 'inter', away: 'como', kickoff: now - 35 * MINUTE, state: 'in', status: 'STATUS_FIRST_HALF', score: [1, 0], clock: "35'" },
    derby: { eventId: '900002', home: 'milan', away: 'juventus', kickoff: now + 2 * DAY, state: 'pre', status: 'STATUS_SCHEDULED' },
    // Its kick-off is under 2 hours ago, so the chip shows it until the next 6 a.m. for longer than a run takes.
    finished: { eventId: '900003', home: 'napoli', away: 'lazio', kickoff: now - 100 * MINUTE, state: 'post', status: 'STATUS_FULL_TIME', score: [1, 1] },
    // A closed match shows until kick-off + 3 hours.
    postponed: { eventId: '900004', home: 'arsenal', away: 'chelsea', kickoff: now - 30 * MINUTE, state: 'post', status: 'STATUS_POSTPONED', score: [0, 0] },
    unavailable: { eventId: '900005', home: 'realMadrid', away: 'barcelona', kickoff: now - 40 * MINUTE, state: 'in', status: 'STATUS_FIRST_HALF', score: [2, 2], clock: "40'" },
    napoliNext: { eventId: '900006', home: 'como', away: 'napoli', kickoff: now + 6 * DAY, state: 'pre', status: 'STATUS_SCHEDULED' },
    arsenalNext: { eventId: '900007', home: 'chelsea', away: 'arsenal', kickoff: now + 5 * DAY, state: 'pre', status: 'STATUS_SCHEDULED' },
  };
}

/** What ESPN's `/all/teams/{id}` gives as `nextEvent`, by team. A team not listed has none. */
const NEXT_MATCH = { inter: 'live', milan: 'derby', juventus: 'derby', napoli: 'napoliNext', arsenal: 'arsenalNext' };

/** The pins of the `football` Seed, by chat partner, in the order they are added. */
export const SEEDED_PINS = {
  carol: ['inter', 'milan', 'juventus'],
  dave: ['napoli', 'arsenal', 'realMadrid'],
  erin: ['atalanta'],
};

/** What the Seed writes past the public functions: the matches no next-match lookup gives. */
export const SEEDED_MATCHES = {
  last: { napoli: 'finished', arsenal: 'postponed' },
  next: { realMadrid: 'unavailable' },
  /** Older than the 2 minutes after which a live score counts as unavailable. */
  staleMs: { unavailable: 10 * MINUTE },
};

/** The live match's details, as the drawer shows them. */
export const LIVE_DETAILS = {
  competition: 'Italian Serie A',
  venue: 'Stadio Giuseppe Meazza',
  scorer: 'Marco Bellini',
  assist: 'Luca Ferri',
  booked: 'Paolo Conti',
  formation: '3-5-2',
};

const espnTeam = (key) => {
  const team = TEAMS[key];
  return { id: team.id, displayName: team.name, shortDisplayName: team.shortName, abbreviation: team.abbreviation };
};

/** One event as ESPN's scoreboard has it. */
export function espnEvent(match) {
  const competitor = (key, homeAway, score) => ({ homeAway, team: espnTeam(key), ...(score === undefined ? {} : { score: String(score) }) });
  const status = { ...(match.clock ? { displayClock: match.clock } : {}), type: { state: match.state, name: match.status } };
  return {
    id: match.eventId,
    date: new Date(match.kickoff).toISOString(),
    competitions: [{ status, competitors: [competitor(match.home, 'home', match.score?.[0]), competitor(match.away, 'away', match.score?.[1])] }],
  };
}

/** A league's events, from the matches of `footballMatches`. The home team's league is the match's. */
export function espnScoreboard(league, matches) {
  return { events: Object.values(matches).filter((m) => TEAMS[m.home].league === league).map(espnEvent) };
}

export function espnTeamList(league) {
  const teams = Object.keys(TEAMS).filter((key) => TEAMS[key].league === league);
  return { sports: [{ leagues: [{ teams: teams.map((key) => ({ team: espnTeam(key) })) }] }] };
}

/** ESPN's `/all/teams/{id}`, with the team's next match. `null` for a team the stub does not know. */
export function espnTeamEndpoint(teamId, matches) {
  const key = Object.keys(TEAMS).find((k) => TEAMS[k].id === teamId);
  if (!key) return null;
  const next = NEXT_MATCH[key] ? matches[NEXT_MATCH[key]] : null;
  return { team: { id: teamId, nextEvent: next ? [{ ...espnEvent(next), league: { slug: TEAMS[next.home].league } }] : [] } };
}

/** The live match's summary: a goal with an assist, a booking, both lineups and the stats. */
export function espnLiveSummary(matches) {
  const live = matches.live;
  const [home, away] = [TEAMS[live.home], TEAMS[live.away]];
  /** Numbered from 40 (starters) and 60 (bench), so no generated jersey meets a named player's. */
  const players = (team, count, starter) =>
    Array.from({ length: count }, (_, i) => {
      const jersey = String((starter ? 40 : 60) + i);
      return { starter, jersey, athlete: { displayName: `${team.shortName} Player ${jersey}` } };
    });
  const roster = (team, homeAway, named) => ({
    homeAway,
    team: { id: team.id },
    formation: LIVE_DETAILS.formation,
    roster: [...named, ...players(team, 11 - named.length, true), ...players(team, 5, false)],
  });
  const starter = (name, jersey) => ({ starter: true, jersey, athlete: { displayName: name } });
  const stat = (name, home, away) => [
    { name, displayValue: String(home) },
    { name, displayValue: String(away) },
  ];
  const stats = [stat('possessionPct', 58, 42), stat('totalShots', 9, 4), stat('shotsOnTarget', 4, 1), stat('wonCorners', 5, 2), stat('foulsCommitted', 6, 8), stat('offsides', 1, 2)];
  return {
    header: {
      league: { name: LIVE_DETAILS.competition },
      competitions: [{ competitors: [{ id: home.id, homeAway: 'home' }, { id: away.id, homeAway: 'away' }] }],
    },
    gameInfo: { venue: { fullName: LIVE_DETAILS.venue } },
    keyEvents: [
      { type: { type: 'kickoff' }, clock: { displayValue: '' }, shootout: false },
      {
        type: { type: 'goal' },
        clock: { displayValue: "12'" },
        team: { id: home.id },
        participants: [{ athlete: { displayName: LIVE_DETAILS.scorer } }, { athlete: { displayName: LIVE_DETAILS.assist } }],
      },
      { type: { type: 'yellow-card' }, clock: { displayValue: "27'" }, team: { id: away.id }, participants: [{ athlete: { displayName: LIVE_DETAILS.booked } }] },
    ],
    rosters: [
      roster(home, 'home', [starter(LIVE_DETAILS.scorer, '10'), starter(LIVE_DETAILS.assist, '7')]),
      roster(away, 'away', [starter(LIVE_DETAILS.booked, '5')]),
    ],
    boxscore: {
      teams: [
        { team: { id: home.id }, statistics: stats.map(([h]) => h) },
        { team: { id: away.id }, statistics: stats.map(([, a]) => a) },
      ],
    },
  };
}

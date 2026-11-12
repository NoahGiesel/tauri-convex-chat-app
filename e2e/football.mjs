// The canned ESPN data that the stub serves and the `football` Seed is built from, so the two cannot disagree.
// Kick-offs are relative to `now`: the stub fixes it when it starts, and the Seed when it is built.
// No logos, so a crest shows its initials and no run asks the internet for an image.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The season every competition is in, as ESPN spells it in a schedule entry. */
const SEASON_YEAR = 2026;

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

/** The competitions of the drawer's teams, as a schedule entry and a table spell them. */
export const COMPETITIONS = {
  'ita.1': { name: 'Italian Serie A', abbreviation: 'Serie A', season: '2026-27 Italian Serie A' },
  'uefa.champions': { name: 'UEFA Champions League', abbreviation: 'Champions League', season: '2026-27 UEFA Champions League' },
  'ita.coppa_italia': { name: 'Coppa Italia', abbreviation: 'Coppa Italia', season: '2026-27 Coppa Italia' },
};

/**
 * Every match a run knows, by name. `home` and `away` are keys of TEAMS.
 * The FT, postponed and unavailable ones are each a pinned team's last or next match, which the Seed writes itself.
 */
/**
 * The finished match's kick-off. Its chip shows until the first 6 a.m. (local) after kick-off + 2 h. Normally that
 * is 100 minutes ago, and the next 6 a.m. is over an hour away. Within the last hour before 6 a.m., kick-off + 2 h
 * goes just past it, so the chip shows until the 6 a.m. after.
 */
function finishedKickoff(now) {
  const sixAm = new Date(now);
  sixAm.setHours(6, 0, 0, 0);
  if (sixAm.getTime() <= now) sixAm.setDate(sixAm.getDate() + 1);
  return sixAm.getTime() - now > HOUR ? now - 100 * MINUTE : sixAm.getTime() - 2 * HOUR + MINUTE;
}

export function footballMatches(now) {
  return {
    live: { eventId: '900001', home: 'inter', away: 'como', kickoff: now - 35 * MINUTE, state: 'in', status: 'STATUS_FIRST_HALF', score: [1, 0], clock: "35'" },
    derby: { eventId: '900002', home: 'milan', away: 'juventus', kickoff: now + 2 * DAY, state: 'pre', status: 'STATUS_SCHEDULED' },
    finished: { eventId: '900003', home: 'napoli', away: 'lazio', kickoff: finishedKickoff(now), state: 'post', status: 'STATUS_FULL_TIME', score: [1, 1] },
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

/** The teams whose schedule the stub serves and the Seed writes: the three of Alice's chat with Carol. */
export const SEEDED_SCHEDULES = ['inter', 'milan', 'juventus'];
/** The competitions whose table the stub serves and the Seed writes. The Coppa Italia has no table. */
export const SEEDED_STANDINGS = ['ita.1', 'uefa.champions', 'ita.coppa_italia'];

/**
 * The matches of those three teams: results played and fixtures to come, all shared by both sides.
 * `offset` is from `now`. `state` post is a result, pre a fixture. The last three are the cups' path.
 */
const SCHEDULE = [
  // Inter's results, newest first, across three competitions.
  { id: '910001', home: 'inter', away: 'como', offset: -5 * DAY, league: 'ita.1', state: 'post', score: [2, 0] },
  { id: '910010', home: 'inter', away: 'realMadrid', offset: -8 * DAY, league: 'uefa.champions', round: 'League Phase', state: 'post', score: [2, 1] },
  { id: '910002', home: 'milan', away: 'inter', offset: -12 * DAY, league: 'ita.1', state: 'post', score: [3, 1] },
  { id: '910003', home: 'inter', away: 'napoli', offset: -19 * DAY, league: 'ita.1', state: 'post', score: [1, 1] },
  { id: '910020', home: 'inter', away: 'lazio', offset: -20 * DAY, league: 'ita.coppa_italia', round: 'Round of 16', state: 'post', score: [3, 1] },
  { id: '910004', home: 'atalanta', away: 'inter', offset: -26 * DAY, league: 'ita.1', state: 'post', score: [0, 2] },
  { id: '910005', home: 'inter', away: 'lazio', offset: -33 * DAY, league: 'ita.1', state: 'post', score: [4, 1] },
  // AC Milan's and Juventus's results.
  { id: '910006', home: 'milan', away: 'juventus', offset: -9 * DAY, league: 'ita.1', state: 'post', score: [1, 0] },
  { id: '910011', home: 'milan', away: 'barcelona', offset: -15 * DAY, league: 'uefa.champions', round: 'League Phase', state: 'post', score: [0, 0] },
  { id: '910007', home: 'juventus', away: 'napoli', offset: -16 * DAY, league: 'ita.1', state: 'post', score: [2, 2] },
  { id: '910012', home: 'juventus', away: 'arsenal', offset: -22 * DAY, league: 'uefa.champions', round: 'League Phase', state: 'post', score: [3, 2] },
  { id: '910008', home: 'juventus', away: 'atalanta', offset: -23 * DAY, league: 'ita.1', state: 'post', score: [1, 0] },
  // The matches to come.
  { id: '910030', home: 'inter', away: 'lazio', offset: 5 * DAY, league: 'ita.1', state: 'pre' },
  { id: '910032', home: 'milan', away: 'napoli', offset: 6 * DAY, league: 'ita.1', state: 'pre' },
  { id: '910034', home: 'juventus', away: 'como', offset: 7 * DAY, league: 'ita.1', state: 'pre' },
  { id: '910031', home: 'inter', away: 'arsenal', offset: 12 * DAY, league: 'uefa.champions', round: 'League Phase', state: 'pre' },
  { id: '910033', home: 'milan', away: 'chelsea', offset: 13 * DAY, league: 'uefa.champions', round: 'League Phase', state: 'pre' },
  { id: '910035', home: 'juventus', away: 'barcelona', offset: 14 * DAY, league: 'uefa.champions', round: 'League Phase', state: 'pre' },
  { id: '910036', home: 'juventus', away: 'inter', offset: 21 * DAY, league: 'ita.coppa_italia', round: 'Quarterfinals', state: 'pre' },
];

/** The result a test opens from the Matches tab. Its summary is canned, so the drawer can show it. */
export const FINISHED_MATCH = { eventId: '910001', home: 'inter', away: 'como', score: [2, 0] };
export const FINISHED_DETAILS = { venue: 'Stadio Giuseppe Meazza', scorer: 'Nerio Rossi', minute: "23'" };

/** The named players of the live match. Their ids join the events to the pitch markers and the bench rows. */
export const LIVE_PLAYERS = {
  scorer: { id: 'home-9', name: 'Marco Bellini', shortName: 'M. Bellini' },
  assist: { id: 'home-10', name: 'Luca Ferri', shortName: 'L. Ferri' },
  booked: { id: 'away-5', name: 'Paolo Conti', shortName: 'P. Conti' },
  substitute: { id: 'home-22', name: 'Matteo Greco', shortName: 'M. Greco' },
  replaced: { id: 'home-7', name: 'Davide Russo', shortName: 'D. Russo' },
};

/** The live match's details, as the drawer shows them. */
export const LIVE_DETAILS = {
  competition: 'Italian Serie A',
  venue: 'Stadio Giuseppe Meazza',
  scorer: LIVE_PLAYERS.scorer.name,
  assist: LIVE_PLAYERS.assist.name,
  booked: LIVE_PLAYERS.booked.name,
  substitute: LIVE_PLAYERS.substitute.name,
  replaced: LIVE_PLAYERS.replaced.name,
  minute: "61'",
  /** Both formations are in the parser's table, so every starter gets a place on the pitch. */
  formations: { home: '3-5-2', away: '4-2-3-1' },
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

/** One entry of a team's schedule, as ESPN's `/all/teams/{id}/schedule` has it. */
function espnScheduleEvent(now, event) {
  const competition = COMPETITIONS[event.league];
  const post = event.state === 'post';
  const competitor = (key, homeAway, goals, conceded) => ({
    homeAway,
    ...(post ? { winner: goals > conceded } : {}),
    ...(post ? { score: { value: goals } } : {}),
    team: espnTeam(key),
  });
  return {
    id: event.id,
    date: new Date(now + event.offset).toISOString(),
    timeValid: true,
    season: { year: SEASON_YEAR, displayName: competition.season },
    seasonType: { name: event.round ?? competition.season },
    league: { slug: event.league, name: competition.name, abbreviation: competition.abbreviation },
    competitions: [
      {
        status: { type: { name: post ? 'STATUS_FULL_TIME' : 'STATUS_SCHEDULED', state: event.state } },
        competitors: [
          competitor(event.home, 'home', event.score?.[0], event.score?.[1]),
          competitor(event.away, 'away', event.score?.[1], event.score?.[0]),
        ],
      },
    ],
  };
}

/** A whole ESPN schedule answer: its season, its team and the events, in the order given. */
function scheduleResponse(teamKey, events) {
  const team = TEAMS[teamKey];
  return {
    season: { year: SEASON_YEAR, displayName: COMPETITIONS[team.league]?.season ?? COMPETITIONS['ita.1'].season },
    team: { id: team.id, isNational: false },
    events,
  };
}

/** A team's schedule as ESPN's endpoint has it. A team with no canned matches gets an empty one. */
export function espnSchedule(schedules, teamKey, fixture) {
  const canned = schedules[teamKey];
  if (!canned) return scheduleResponse(teamKey, []);
  return fixture ? canned.fixtures : canned.results;
}

/**
 * The schedule of each team the stub serves and the Seed writes: the results of the season, newest first,
 * and the matches to come, soonest first. Both sides share one entry, so a derby appears in both.
 * Each list is a whole ESPN answer, so the Seed reads it with the app's parser as the backend would.
 */
export function footballSchedules(now) {
  const byTeam = {};
  for (const key of SEEDED_SCHEDULES) {
    const mine = SCHEDULE.map((event) => ({ event, espn: espnScheduleEvent(now, event) })).filter(({ event }) => event.home === key || event.away === key);
    const results = mine.filter(({ event }) => event.state === 'post').sort((a, b) => b.event.offset - a.event.offset).map(({ espn }) => espn);
    const fixtures = mine.filter(({ event }) => event.state === 'pre').sort((a, b) => a.event.offset - b.event.offset).map(({ espn }) => espn);
    byTeam[key] = { results: scheduleResponse(key, results), fixtures: scheduleResponse(key, fixtures) };
  }
  return byTeam;
}

/** A row of a table: ESPN's 14 stats, read by name. Unused ones stay at a plausible value. */
function standingsEntry(key, { rank, played, goalDifference, points, zone }) {
  const stats = (name, value) => ({ name, value });
  return {
    team: espnTeam(key),
    stats: [
      stats('rank', rank),
      stats('gamesPlayed', played),
      stats('wins', Math.round(points / 3)),
      stats('ties', 0),
      stats('losses', 0),
      stats('pointsFor', 0),
      stats('pointsAgainst', 0),
      stats('pointDifferential', goalDifference),
      stats('points', points),
    ],
    // ESPN's note can carry a doubled `#` and stray tabs.
    ...(zone ? { note: { color: `##${zone.color}`, description: `\t${zone.label}\t` } } : {}),
  };
}

const CHAMPIONS_ZONE = { color: '0078FF', label: 'Champions League' };
const RELEGATION_ZONE = { color: 'FF0000', label: 'Relegation' };

/** One table per competition. A competition with no table is left out, and the parser reads it as a cup's path. */
const STANDINGS = {
  'ita.1': [
    standingsEntry('inter', { rank: 1, played: 12, goalDifference: 18, points: 30, zone: CHAMPIONS_ZONE }),
    standingsEntry('milan', { rank: 2, played: 12, goalDifference: 12, points: 27, zone: CHAMPIONS_ZONE }),
    standingsEntry('juventus', { rank: 3, played: 12, goalDifference: 9, points: 24 }),
    standingsEntry('napoli', { rank: 4, played: 12, goalDifference: 6, points: 22 }),
    standingsEntry('atalanta', { rank: 5, played: 12, goalDifference: 3, points: 19 }),
    standingsEntry('lazio', { rank: 6, played: 12, goalDifference: -2, points: 15 }),
    standingsEntry('como', { rank: 7, played: 12, goalDifference: -8, points: 10, zone: RELEGATION_ZONE }),
  ],
  'uefa.champions': [
    standingsEntry('inter', { rank: 1, played: 6, goalDifference: 7, points: 15, zone: CHAMPIONS_ZONE }),
    standingsEntry('milan', { rank: 2, played: 6, goalDifference: 5, points: 13 }),
    standingsEntry('juventus', { rank: 3, played: 6, goalDifference: 3, points: 11 }),
    standingsEntry('realMadrid', { rank: 4, played: 6, goalDifference: 2, points: 9 }),
    standingsEntry('barcelona', { rank: 5, played: 6, goalDifference: 1, points: 8 }),
  ],
};

/** A competition's table as ESPN's endpoint has it, or `null` for a competition the stub does not know. */
export function espnStandings(league) {
  const competition = COMPETITIONS[league];
  if (!competition) return null;
  const rows = STANDINGS[league];
  return {
    season: { year: SEASON_YEAR, displayName: competition.season, startDate: '2026-08-01T00:00:00Z', endDate: '2027-05-30T00:00:00Z' },
    // A cup without a table is a 200 with no `children`, not an error.
    ...(rows ? { children: [{ name: competition.season, standings: { entries: rows } }] } : {}),
  };
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

/** A starter of the live match: jersey, name and the ESPN position label, with its place from 1 to 11. */
const squad = (side, formation, players) => ({
  side,
  formation,
  players: players.map(([jersey, name, shortName, label], i) => ({ jersey, id: `${side}-${jersey}`, name, shortName, label, place: String(i + 1) })),
});
const bench = (side, players) =>
  players.map(([jersey, name, shortName]) => ({ jersey, id: `${side}-${jersey}`, name, shortName, label: 'SUB', place: '0' }));

const LIVE_LINEUPS = {
  home: squad('home', LIVE_DETAILS.formations.home, [
    ['1', 'Samuele Riva', 'S. Riva', 'G'],
    ['4', 'Pietro Sala', 'P. Sala', 'CD-R'],
    ['5', 'Gianni Moretti', 'G. Moretti', 'CD'],
    ['6', 'Edoardo Villa', 'E. Villa', 'CD-L'],
    ['3', 'Luca Fontana', 'L. Fontana', 'LB'],
    ['8', 'Nico Serra', 'N. Serra', 'CM'],
    ['11', 'Tomas Greco', 'T. Greco', 'CM'],
    ['7', 'Davide Russo', 'D. Russo', 'RM'],
    ['2', 'Marco Fabbri', 'M. Fabbri', 'RB'],
    ['9', 'Marco Bellini', 'M. Bellini', 'CF'],
    ['10', 'Luca Ferri', 'L. Ferri', 'CF'],
  ]),
  away: squad('away', LIVE_DETAILS.formations.away, [
    ['1', 'Elia Costa', 'E. Costa', 'G'],
    ['3', 'Rui Alves', 'R. Alves', 'LB'],
    ['6', 'Marco Sala', 'M. Sala', 'CD-R'],
    ['5', 'Paolo Conti', 'P. Conti', 'CD'],
    ['2', 'Tom Vermeulen', 'T. Vermeulen', 'RB'],
    ['4', 'Ivan Petrov', 'I. Petrov', 'DM'],
    ['8', 'Nils Berg', 'N. Berg', 'DM'],
    ['11', 'Juan Diaz', 'J. Diaz', 'LM'],
    ['10', 'Sami Kaya', 'S. Kaya', 'AM'],
    ['7', 'Noah Lima', 'N. Lima', 'RM'],
    ['9', 'Omar Haddad', 'O. Haddad', 'CF'],
  ]),
};
const LIVE_BENCH = {
  home: bench('home', [
    ['21', 'Filippo Neri', 'F. Neri'],
    ['22', 'Matteo Greco', 'M. Greco'],
    ['23', 'Andrea Longo', 'A. Longo'],
    ['24', 'Sergio Bruno', 'S. Bruno'],
    ['25', 'Pablo Ruiz', 'P. Ruiz'],
  ]),
  away: bench('away', [
    ['21', 'Tobias Roth', 'T. Roth'],
    ['22', 'Kenji Mori', 'K. Mori'],
    ['23', 'Bruno Costa', 'B. Costa'],
    ['24', 'Andre Silva', 'A. Silva'],
    ['25', 'Diego Paz', 'D. Paz'],
  ]),
};

/** A player of a summary's roster: the fields the parser reads, and the ones that tie it to an event. */
function rosterPlayer(side, player, starter) {
  return {
    starter,
    jersey: player.jersey,
    athlete: { id: player.id, displayName: player.name, shortName: player.shortName },
    position: { abbreviation: player.label },
    formationPlace: player.place,
    subbedIn: player.name === LIVE_DETAILS.substitute,
    subbedOut: player.name === LIVE_DETAILS.replaced,
  };
}

/** One participant of a key event, by the player the id names. */
const participant = (player) => ({ athlete: { id: player.id, displayName: player.name } });

/** The live match's summary: a goal with an assist, a booking, a substitution, both lineups with places and the stats. */
export function espnLiveSummary(matches) {
  const live = matches.live;
  const [home, away] = [TEAMS[live.home], TEAMS[live.away]];
  const roster = (side, team) => ({
    homeAway: side,
    team: { id: team.id },
    formation: LIVE_LINEUPS[side].formation,
    roster: [
      ...LIVE_LINEUPS[side].players.map((player) => rosterPlayer(side, player, true)),
      ...LIVE_BENCH[side].map((player) => rosterPlayer(side, player, false)),
    ],
  });
  const stat = (name, left, right) => [
    { name, displayValue: String(left) },
    { name, displayValue: String(right) },
  ];
  const stats = [
    stat('possessionPct', 58, 42),
    stat('totalShots', 9, 4),
    stat('shotsOnTarget', 4, 1),
    stat('wonCorners', 5, 2),
    stat('foulsCommitted', 6, 8),
    stat('offsides', 1, 2),
  ];
  return {
    header: {
      league: { name: LIVE_DETAILS.competition },
      competitions: [
        {
          competitors: [
            { id: home.id, homeAway: 'home', team: { color: '00239c' } },
            { id: away.id, homeAway: 'away', team: { color: '4169E1' } },
          ],
        },
      ],
    },
    gameInfo: { venue: { fullName: LIVE_DETAILS.venue } },
    keyEvents: [
      { type: { type: 'kickoff' }, clock: { displayValue: '' }, shootout: false },
      {
        type: { type: 'goal' },
        clock: { displayValue: "12'" },
        team: { id: home.id },
        participants: [participant(LIVE_PLAYERS.scorer), participant(LIVE_PLAYERS.assist)],
      },
      {
        type: { type: 'yellow-card' },
        clock: { displayValue: "27'" },
        team: { id: away.id },
        participants: [participant(LIVE_PLAYERS.booked)],
      },
      {
        type: { type: 'substitution' },
        clock: { displayValue: LIVE_DETAILS.minute },
        team: { id: home.id },
        participants: [participant(LIVE_PLAYERS.substitute), participant(LIVE_PLAYERS.replaced)],
      },
    ],
    rosters: [roster('home', home), roster('away', away)],
    boxscore: {
      teams: [
        { team: { id: home.id }, statistics: stats.map(([left]) => left) },
        { team: { id: away.id }, statistics: stats.map(([, right]) => right) },
      ],
    },
  };
}

/** The finished match's summary: a goal and a venue, and no lineups, which is all a test reads of it. */
export function espnFinishedSummary() {
  const [home, away] = [TEAMS[FINISHED_MATCH.home], TEAMS[FINISHED_MATCH.away]];
  return {
    header: {
      league: { name: COMPETITIONS['ita.1'].name },
      competitions: [{ competitors: [{ id: home.id, homeAway: 'home' }, { id: away.id, homeAway: 'away' }] }],
    },
    gameInfo: { venue: { fullName: FINISHED_DETAILS.venue } },
    keyEvents: [
      { type: { type: 'kickoff' }, clock: { displayValue: '' }, shootout: false },
      {
        type: { type: 'goal' },
        clock: { displayValue: FINISHED_DETAILS.minute },
        team: { id: home.id },
        participants: [{ athlete: { displayName: FINISHED_DETAILS.scorer } }],
      },
    ],
  };
}

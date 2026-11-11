/**
 * Il fornitore dei dati di calcio: tutte le chiamate a ESPN e la lettura delle risposte stanno qui.
 * Fuori da questo file circolano solo i nostri tipi, così un altro fornitore potrà sostituirlo.
 * ESPN non ha documentazione: ogni risposta si controlla, e un campo mancante è un errore
 * come una risposta non 200 (docs/adr/0001-espn-json-for-team-pins.md).
 */
import type { Doc } from "./_generated/dataModel";
import { FRIENDLY_LEAGUES } from "./footballLeagues";

const DEFAULT_BASE_URL = "https://site.api.espn.com/apis";
/** Una richiesta ESPN appesa non deve bloccare il cron che l'ha lanciata. */
const TIMEOUT_MS = 10_000;

/** Una risposta ESPN che non si è potuta usare: rete, stato HTTP o formato cambiato. */
export class EspnError extends Error {}

/** Le competizioni dei club dell'indice, nell'ordine in cui vincono: prima il campionato nazionale. */
export const CLUB_COMPETITIONS: { league: string; label: string }[] = [
  { league: "ita.1", label: "Serie A" },
  { league: "eng.1", label: "Premier League" },
  { league: "esp.1", label: "LaLiga" },
  { league: "ger.1", label: "Bundesliga" },
  { league: "fra.1", label: "Ligue 1" },
  { league: "uefa.champions", label: "Champions League" },
  { league: "uefa.europa", label: "Europa League" },
  { league: "uefa.europa.conf", label: "Conference League" },
];

/** La lista ESPN che contiene tutte le nazionali (le amichevoli). */
export const NATIONAL_TEAMS_LEAGUE = "fifa.friendly";

export type ProviderTeam = {
  teamId: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logo?: string;
};

function baseUrl() {
  return (process.env.ESPN_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

async function getJson(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new EspnError(`ESPN ${path}: ${String(e)}`);
  }
  if (!res.ok) throw new EspnError(`ESPN ${path}: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new EspnError(`ESPN ${path}: not JSON`);
  }
}

// --- Lettura difensiva -------------------------------------------------------------------

type Obj = Record<string, unknown>;

function obj(value: unknown, what: string): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new EspnError(`ESPN: ${what} missing`);
  return value as Obj;
}
function arr(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new EspnError(`ESPN: ${what} missing`);
  return value;
}
function str(value: unknown, what: string): string {
  if (typeof value !== "string" || value === "") throw new EspnError(`ESPN: ${what} missing`);
  return value;
}
function optStr(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
function optObj(value: unknown): Obj | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Obj) : undefined;
}

/**
 * Squadre giovanili, riserve e femminili: le liste coperte non dovrebbero averne,
 * ma non entrano mai nell'indice.
 */
const NOT_SENIOR_MEN = /\b(u-?\d{2}|ii|b team|primavera|castilla|reserves?|women|femenino|féminin|feminine|femminile|frauen)\b/i;

/** Lo stemma è facoltativo: senza, il picker mostra le iniziali. Gli altri campi devono esserci. */
function parseTeam(value: unknown): ProviderTeam {
  const team = obj(value, "team");
  const logos = Array.isArray(team.logos) ? team.logos : [];
  const firstLogo = logos.length > 0 && typeof logos[0] === "object" && logos[0] !== null ? (logos[0] as Obj).href : undefined;
  return {
    teamId: str(team.id, "team.id"),
    name: str(team.displayName, "team.displayName"),
    shortName: str(team.shortDisplayName, "team.shortDisplayName"),
    abbreviation: str(team.abbreviation, "team.abbreviation"),
    logo: optStr(firstLogo) ?? optStr(team.logo),
  };
}

export type MatchState = "pre" | "in" | "post";

export type ProviderMatch = {
  eventId: string;
  league: string;
  home: ProviderTeam;
  away: ProviderTeam;
  kickoff: number;
  state: MatchState;
  statusName: string;
  score?: { home: number; away: number };
  shootout?: { home: number; away: number };
  clock?: string;
};

/** Un numero ESPN (punteggio o statistica): stringa nei tabelloni ("2"), oggetto in `nextEvent` ({ value: 2 }). */
function readNumber(value: unknown, what: string): number {
  const raw = typeof value === "object" && value !== null ? (value as Obj).value : value;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new EspnError(`ESPN: ${what} missing`);
  return n;
}

function readState(value: unknown): MatchState {
  if (value === "pre" || value === "in" || value === "post") return value;
  throw new EspnError("ESPN: status.type.state missing");
}

/** La data ESPN in millisecondi. Una data assente o illeggibile è un errore. */
function readKickoff(value: unknown): number {
  const kickoff = Date.parse(str(value, "event.date"));
  if (Number.isNaN(kickoff)) throw new EspnError("ESPN: event.date missing");
  return kickoff;
}

/** Una partita, da un tabellone o da `nextEvent`. `league` è lo slug, che i tabelloni non ripetono per partita. */
function parseEvent(value: unknown, league: string): ProviderMatch {
  const event = obj(value, "event");
  const competition = obj(arr(event.competitions, "competitions")[0], "competitions[0]");
  const status = obj(competition.status ?? event.status, "status");
  const type = obj(status.type, "status.type");
  const state = readState(type.state);
  const competitors = arr(competition.competitors, "competitors").map((c) => obj(c, "competitors[]"));
  const side = (homeAway: "home" | "away") => {
    const found = competitors.find((c) => c.homeAway === homeAway);
    if (!found) throw new EspnError(`ESPN: ${homeAway} competitor missing`);
    return found;
  };
  const home = side("home");
  const away = side("away");
  const kickoff = Date.parse(str(event.date, "event.date"));
  if (Number.isNaN(kickoff)) throw new EspnError("ESPN: event.date missing");

  const match: ProviderMatch = {
    eventId: str(event.id, "event.id"),
    league,
    home: parseTeam(home.team),
    away: parseTeam(away.team),
    kickoff,
    state,
    statusName: str(type.name, "status.type.name"),
  };
  // Prima del calcio d'inizio il punteggio non c'è (o è 0-0): si legge solo da quando si gioca.
  if (state !== "pre") {
    match.score = { home: readNumber(home.score, "home score"), away: readNumber(away.score, "away score") };
    if (home.shootoutScore !== undefined || away.shootoutScore !== undefined) {
      match.shootout = { home: readNumber(home.shootoutScore, "home shootoutScore"), away: readNumber(away.shootoutScore, "away shootoutScore") };
    }
    const clock = optStr(status.displayClock);
    if (clock) match.clock = clock;
  }
  return match;
}

/**
 * La prossima partita di una squadra, in qualunque competizione (`nextEvent` di `/all/teams/{id}`).
 * `null` se non ne ha in programma: ESPN manda allora una lista vuota.
 */
export async function fetchNextMatch(teamId: string): Promise<ProviderMatch | null> {
  const json = obj(await getJson(`/site/v2/sports/soccer/all/teams/${encodeURIComponent(teamId)}`), "team response");
  const team = obj(json.team, "team");
  const events = arr(team.nextEvent, "team.nextEvent");
  if (events.length === 0) return null;
  const event = obj(events[0], "nextEvent[0]");
  const league = str(obj(event.league, "nextEvent.league").slug, "nextEvent.league.slug");
  return parseEvent(event, league);
}

/** La competizione ESPN di una squadra dell'indice, per cercarne la partita in corso. */
export function competitionLeague(team: { competition?: string; national: boolean }): string | undefined {
  if (team.competition) return CLUB_COMPETITIONS.find((c) => c.label === team.competition)?.league;
  return team.national ? NATIONAL_TEAMS_LEAGUE : undefined;
}

/** Una partita del calendario alleggerita: la riga di `footballTeamSchedules` senza `fetchedAt`. */export type ProviderScheduleMatch = Doc<"footballTeamSchedules">["results"][number];
export type ProviderCompetition = Doc<"footballTeamSchedules">["competitions"][number];
export type ProviderSchedule = { matches: ProviderScheduleMatch[]; competitions: ProviderCompetition[] };

/**
 * Le partite di un calendario ESPN (`all/teams/{id}/schedule`), alleggerite in righe del tab Partite.
 * Ogni voce porta competizione, turno, avversario, lato, punteggio e stato; il punteggio dei rigori
 * sta in `competitors[].score.shootoutScore`, dove il tabellone non lo mette.
 * Le competizioni sono gli slug della risposta senza le amichevoli; per una nazionale contano solo le
 * voci della stagione in corso, perché le sue 25 partite attraversano più cicli.
 */
export function parseSchedule(json: unknown, teamId: string): ProviderSchedule {
  const root = obj(json, "schedule");
  const seasonYear = readNumber(obj(root.season, "season").year, "season.year");
  const national = obj(root.team, "team").isNational === true;
  const matches: ProviderScheduleMatch[] = [];
  const competitions = new Map<string, ProviderCompetition>();

  for (const raw of arr(root.events, "events")) {
    const event = obj(raw, "events[]");
    const competition = obj(arr(event.competitions, "competitions")[0], "competitions[0]");
    const status = obj(competition.status ?? event.status, "status");
    const statusType = obj(status.type, "status.type");
    const state = readState(statusType.state);
    const statusName = optStr(statusType.name);
    const competitors = arr(competition.competitors, "competitors").map((c) => obj(c, "competitors[]"));
    const homeSide = competitors.find((c) => c.homeAway === "home");
    const awaySide = competitors.find((c) => c.homeAway === "away");
    const teamIdOf = (c: Obj | undefined) => (c ? optStr(optObj(c.team)?.id) : undefined);
    const homeTeamId = teamIdOf(homeSide);
    const awayTeamId = teamIdOf(awaySide);
    // Una voce rotta (senza un lato o senza una squadra) si salta: non deve fermare tutto il calendario.
    if (!homeTeamId || !awayTeamId) continue;
    const mine = homeTeamId === teamId ? homeSide : awayTeamId === teamId ? awaySide : undefined;
    if (!mine || !homeSide || !awaySide) continue;
    const other = mine === homeSide ? awaySide : homeSide;
    const winner = homeSide.winner === true ? "home" : awaySide.winner === true ? "away" : undefined;

    const match: ProviderScheduleMatch = {
      eventId: str(event.id, "event.id"),
      kickoff: readKickoff(event.date),
      league: str(obj(event.league, "league").slug, "league.slug"),
      leagueName: str(obj(event.league, "league").abbreviation, "league.abbreviation"),
      round: str(obj(event.seasonType, "seasonType").name, "seasonType.name"),
      opponent: parseTeam(other.team),
      home: mine === homeSide,
      state,
      ...(statusName ? { statusName } : {}),
      ...(winner ? { winner } : {}),
      ...(event.timeValid === false ? { timeValid: false } : {}),
    };
    if (state !== "pre") {
      match.score = { home: readNumber(homeSide.score, "home score"), away: readNumber(awaySide.score, "away score") };
      const shootoutOf = (c: Obj) => {
        const score = optObj(c.score);
        return score && score.shootoutScore !== undefined ? readNumber(score.shootoutScore, "score.shootoutScore") : undefined;
      };
      const homeShootout = shootoutOf(homeSide);
      const awayShootout = shootoutOf(awaySide);
      if (homeShootout !== undefined || awayShootout !== undefined) {
        match.shootout = { home: homeShootout ?? 0, away: awayShootout ?? 0 };
      }
    }
    matches.push(match);

    const league = obj(event.league, "league");
    const slug = str(league.slug, "league.slug");
    const entrySeason = obj(event.season, "season");
    const entryYear = readNumber(entrySeason.year, "season.year");
    if (FRIENDLY_LEAGUES.includes(slug) || competitions.has(slug)) continue;
    if (national && entryYear !== seasonYear) continue;
    competitions.set(slug, {
      league: slug,
      name: str(league.name, "league.name"),
      shortName: str(league.abbreviation, "league.abbreviation"),
      season: str(entrySeason.displayName, "season.displayName"),
    });
  }
  return { matches, competitions: [...competitions.values()] };
}

/** Il calendario di una squadra: i risultati della stagione in corso o le partite in programma. */
export async function fetchSchedule(teamId: string, kind: "results" | "fixtures"): Promise<ProviderSchedule> {
  const query = kind === "fixtures" ? "?fixture=true" : "";
  return parseSchedule(
    await getJson(`/site/v2/sports/soccer/all/teams/${encodeURIComponent(teamId)}/schedule${query}`),
    teamId,
  );
}

/** Le partite di un tabellone ESPN già scaricato. Una partita illeggibile rende illeggibile tutto il tabellone. */
export function parseScoreboard(json: unknown, league: string): ProviderMatch[] {
  return arr(obj(json, "scoreboard").events, "events").map((event) => parseEvent(event, league));
}

/**
 * I giorni ESPN (`YYYYMMDD`) in cui può stare un calcio d'inizio. ESPN divide i giorni sull'ora della costa est
 * degli Stati Uniti, UTC-5 d'inverno e UTC-4 d'estate: se le due danno giorni diversi si chiedono entrambi.
 */
export function espnDays(kickoff: number): string[] {
  const day = (offsetHours: number) => new Date(kickoff - offsetHours * 3_600_000).toISOString().slice(0, 10).replaceAll("-", "");
  return [...new Set([day(4), day(5)])];
}

/** Le partite di una competizione in un giorno ESPN (`YYYYMMDD`). */
export async function fetchScoreboard(league: string, day: string): Promise<ProviderMatch[]> {
  return parseScoreboard(await getJson(`/site/v2/sports/soccer/${league}/scoreboard?dates=${day}`), league);
}

export type Side = "home" | "away";
/** I dettagli di una partita per il drawer, alleggeriti: pochi KB invece dei ~400 KB del riassunto ESPN. */
export type ProviderDetails = Omit<Doc<"footballMatchDetails">, "_id" | "_creationTime" | "matchId" | "fetchedAt">;
export type MatchEventKind = ProviderDetails["events"][number]["kind"];
export type StatKey = ProviderDetails["stats"][number]["key"];
type LineupPlayer = ProviderDetails["lineups"][number]["starters"][number];

/** I tipi di evento ESPN che il drawer mostra; gli altri (calcio d'inizio, interruzioni…) si ignorano. */
function eventKind(type: string): MatchEventKind | null {
  if (type === "own-goal") return "ownGoal";
  // ESPN scrive il rigore segnato con più trattini ("penalty---scored"): se ne accetta qualunque numero.
  if (/^penalty-+scored$/.test(type)) return "penaltyGoal";
  if (type.startsWith("goal")) return "goal";
  if (type === "yellow-card") return "yellowCard";
  if (type === "red-card" || type === "yellow-red-card" || type === "second-yellow-card") return "redCard";
  if (type === "substitution") return "substitution";
  return null;
}

/** Le statistiche del drawer, dal nome ESPN. "shots" è il totale: in porta, fuori e respinti. */
const STAT_NAMES: Record<string, StatKey> = {
  possessionPct: "possession",
  totalShots: "shots",
  shotsOnTarget: "shotsOnTarget",
  wonCorners: "corners",
  foulsCommitted: "fouls",
  offsides: "offsides",
};
const STAT_ORDER: StatKey[] = ["possession", "shots", "shotsOnTarget", "corners", "fouls", "offsides"];

/** Una posizione in campo: la riga dal fondo (0 è il portiere) e l'ordine da sinistra. */
type Spot = { row: number; order: number };

/**
 * Le dodici formazioni viste nei dati, con il numero di posto ESPN (`formationPlace`) di ogni riga,
 * dal portiere all'attacco e da sinistra a destra. Il numero di posto cambia significato da una
 * formazione all'altra, quindi la tabella è la verità; la regola delle etichette sotto vale solo
 * per una formazione che non c'è (docs/research/espn-pitch-positions.md).
 */
const FORMATION_ROWS: Record<string, string[][]> = {
  "4-2-3-1": [["1"], ["3", "6", "5", "2"], ["4", "8"], ["11", "10", "7"], ["9"]],
  "4-3-3": [["1"], ["3", "6", "5", "2"], ["8", "4", "7"], ["11", "9", "10"]],
  "3-4-2-1": [["1"], ["4", "5", "6"], ["3", "8", "7", "2"], ["11", "10"], ["9"]],
  "3-5-2": [["1"], ["4", "5", "6"], ["3", "8", "11", "7", "2"], ["9", "10"]],
  "4-4-2": [["1"], ["3", "6", "5", "2"], ["11", "8", "4", "7"], ["9", "10"]],
  "3-4-3": [["1"], ["4", "5", "6"], ["3", "8", "7", "2"], ["11", "9", "10"]],
  "4-1-4-1": [["1"], ["3", "6", "5", "2"], ["4"], ["11", "10", "8", "7"], ["9"]],
  "4-3-2-1": [["1"], ["3", "6", "5", "2"], ["7", "4", "8"], ["11", "10"], ["9"]],
  "4-4-1-1": [["1"], ["3", "6", "5", "2"], ["11", "8", "4", "7"], ["10"], ["9"]],
  "4-1-3-2": [["1"], ["3", "6", "5", "2"], ["4"], ["11", "8", "7"], ["10", "9"]],
  "3-1-4-2": [["1"], ["6", "4", "5"], ["8"], ["3", "11", "7", "2"], ["10", "9"]],
  "3-4-1-2": [["1"], ["4", "5", "6"], ["3", "8", "7", "2"], ["9"], ["11", "10"]],
};

/** La profondità di un'etichetta, per la regola di riserva: 1 è la linea difensiva, 6 l'attacco. */
const LABEL_DEPTH: Record<string, number> = {
  CD: 1,
  "CD-L": 1,
  "CD-R": 1,
  LB: 1,
  RB: 1,
  DM: 2,
  SW: 2,
  CM: 3,
  "CM-L": 3,
  "CM-R": 3,
  LM: 3,
  RM: 3,
  M: 3,
  AM: 4,
  "AM-L": 4,
  "AM-R": 4,
  "CF-L": 5,
  "CF-R": 5,
  RCF: 5,
  F: 6,
  LF: 6,
  RF: 6,
};

/** Il lato dell'etichetta: 0 la fascia sinistra, 4 la destra, 2 il centro. */
function labelSide(label: string): number {
  if (label === "LB" || label === "LM" || label === "LF") return 0;
  if (label.endsWith("-L")) return 1;
  if (label === "RB" || label === "RM" || label === "RF") return 4;
  if (label.endsWith("-R") || label === "RCF") return 3;
  return 2;
}

/**
 * La regola delle etichette, per una formazione fuori tabella: si ordinano i dieci di movimento per
 * profondità, si tagliano nelle righe della formazione e si ordina ogni riga da sinistra a destra.
 * `null` quando le etichette non bastano (per esempio prima del calcio d'inizio, quando sono `SUB`).
 */
function placesByLabel(formation: string, players: { place: string; label?: string }[]): Map<string, Spot> | null {
  const sizes = formation.split("-").map((size) => Number.parseInt(size, 10));
  if (sizes.some((size) => !Number.isInteger(size) || size <= 0)) return null;
  const outfield = players.filter((p) => p.place !== "1");
  if (outfield.length !== sizes.reduce((sum, size) => sum + size, 0)) return null;

  const lines: { place: string; depth: number; side: number }[] = [];
  for (const p of outfield) {
    const depth = p.label ? LABEL_DEPTH[p.label] : undefined;
    if (depth === undefined || !p.label) return null;
    lines.push({ place: p.place, depth, side: labelSide(p.label) });
  }
  lines.sort((a, b) => a.depth - b.depth);

  const places = new Map<string, Spot>();
  if (players.some((p) => p.place === "1")) places.set("1", { row: 0, order: 0 });
  // Se un taglio spezza una classe di profondità (una linea difensiva divisa a metà) le etichette non
  // bastano a dire chi sta dove: si rinuncia e il drawer mostra le due liste.
  let boundary = 0;
  for (const size of sizes) {
    boundary += size;
    if (boundary < lines.length && lines[boundary - 1].depth === lines[boundary].depth) return null;
  }
  let from = 0;
  for (const [row, size] of sizes.entries()) {
    const line = lines.slice(from, from + size);
    from += size;
    // Se due giocatori della stessa riga finiscono sullo stesso lato la regola non li sa ordinare:
    // stessa resa, si torna alle liste.
    line.sort((a, b) => a.side - b.side);
    if (new Set(line.map((p) => p.side)).size !== line.length) return null;
    line.forEach((p, order) => places.set(p.place, { row: row + 1, order }));
  }
  return places;
}

/** Il posto di ogni titolare: la tabella per formazione, poi la regola delle etichette. */
function placesOf(formation: string | undefined, starters: Obj[]): Map<string, Spot> {
  if (!formation) return new Map();
  const rows = FORMATION_ROWS[formation];
  if (rows) {
    const places = new Map<string, Spot>();
    rows.forEach((line, row) => line.forEach((place, order) => places.set(place, { row, order })));
    return places;
  }
  const labelled = starters.flatMap((p) => {
    const place = optStr(p.formationPlace);
    return place ? [{ place, label: optStr(optObj(p.position)?.abbreviation) }] : [];
  });
  return placesByLabel(formation, labelled) ?? new Map();
}

/**
 * Il riassunto ESPN di una partita. L'intestazione deve esserci; eventi, formazioni e statistiche possono mancare
 * (prima della partita non ci sono), ma se ci sono vanno letti per intero: un campo mancante è un errore.
 * L'autogol ESPN lo mette dalla parte della squadra che ne beneficia, come il tabellone.
 */
export function parseSummary(json: unknown): ProviderDetails {
  const root = obj(json, "summary");
  const header = obj(root.header, "header");
  const competition = obj(arr(header.competitions, "header.competitions")[0], "header.competitions[0]");
  const sideOf = new Map<string, Side>();
  /** Il colore della maglia di ogni squadra, dall'intestazione: può mancare. */
  const colorOf = new Map<Side, string>();
  for (const c of arr(competition.competitors, "header.competitors").map((c) => obj(c, "header.competitors[]"))) {
    const homeAway = c.homeAway;
    if (homeAway !== "home" && homeAway !== "away") throw new EspnError("ESPN: header.competitors[].homeAway missing");
    sideOf.set(str(c.id, "header.competitors[].id"), homeAway);
    const color = optStr(optObj(c.team)?.color)?.replace(/^#+/, "");
    if (color) colorOf.set(homeAway, color);
  }
  const side = (teamId: unknown, what: string): Side => {
    const found = sideOf.get(str(teamId, what));
    if (!found) throw new EspnError(`ESPN: ${what} missing`);
    return found;
  };

  const events: ProviderDetails["events"] = [];
  for (const raw of Array.isArray(root.keyEvents) ? root.keyEvents : []) {
    const e = obj(raw, "keyEvents[]");
    // I tiri della lotteria dei rigori non sono gol della partita: il chip ne mostra già il punteggio.
    if (e.shootout === true) continue;
    const kind = eventKind(str(obj(e.type, "keyEvents[].type").type, "keyEvents[].type.type"));
    if (!kind) continue;
    const participants = (Array.isArray(e.participants) ? e.participants : []).map((p) => {
      const athlete = obj(obj(p, "participants[]").athlete, "athlete");
      return { name: str(athlete.displayName, "athlete.displayName"), id: optStr(athlete.id) };
    });
    events.push({
      kind,
      minute: str(obj(e.clock, "keyEvents[].clock").displayValue, "keyEvents[].clock.displayValue"),
      side: side(obj(e.team, "keyEvents[].team").id, "keyEvents[].team.id"),
      ...(participants[0] ? { player: participants[0].name } : {}),
      ...(participants[1] ? { other: participants[1].name } : {}),
      ...(participants[0]?.id ? { playerId: participants[0].id } : {}),
      ...(participants[1]?.id ? { otherId: participants[1].id } : {}),
    });
  }

  const lineups: ProviderDetails["lineups"] = [];
  for (const raw of Array.isArray(root.rosters) ? root.rosters : []) {
    const r = obj(raw, "rosters[]");
    // Prima che le formazioni escano ESPN non manda la chiave `roster`: è una formazione vuota, non un errore.
    if (r.roster === undefined) continue;
    const players = arr(r.roster, "rosters[].roster").map((p) => obj(p, "roster[]"));
    if (players.length === 0) continue;
    const formation = optStr(r.formation);
    const starters = players.filter((p) => p.starter === true);
    const places = placesOf(formation, starters);
    const toPlayer = (p: Obj): LineupPlayer => {
      const jersey = optStr(p.jersey);
      const athlete = obj(p.athlete, "roster[].athlete");
      const athleteId = optStr(athlete.id);
      const shortName = optStr(athlete.shortName);
      const place = optStr(p.formationPlace);
      const spot = p.starter === true && place ? places.get(place) : undefined;
      return {
        name: str(athlete.displayName, "roster[].athlete.displayName"),
        ...(jersey ? { jersey } : {}),
        ...(athleteId ? { athleteId } : {}),
        ...(shortName ? { shortName } : {}),
        ...(spot ? { row: spot.row, order: spot.order } : {}),
      };
    };
    const lineupSide = side(obj(r.team, "rosters[].team").id, "rosters[].team.id");
    const color = colorOf.get(lineupSide);
    lineups.push({
      side: lineupSide,
      ...(formation ? { formation } : {}),
      ...(color ? { color } : {}),
      starters: starters.map(toPlayer),
      bench: players.filter((p) => p.starter !== true).map(toPlayer),
    });
  }

  const values = new Map<StatKey, Partial<Record<Side, number>>>();
  const teams = optObj(root.boxscore)?.teams;
  for (const raw of Array.isArray(teams) ? teams : []) {
    const t = obj(raw, "boxscore.teams[]");
    const teamSide = side(obj(t.team, "boxscore.teams[].team").id, "boxscore.teams[].team.id");
    for (const s of Array.isArray(t.statistics) ? t.statistics : []) {
      const stat = obj(s, "statistics[]");
      const key = STAT_NAMES[str(stat.name, "statistics[].name")];
      if (!key) continue;
      values.set(key, { ...values.get(key), [teamSide]: readNumber(stat.displayValue, `statistics.${key}`) });
    }
  }
  const stats = STAT_ORDER.flatMap((key) => {
    const v = values.get(key);
    return v?.home !== undefined && v.away !== undefined ? [{ key, home: v.home, away: v.away }] : [];
  });

  const league = optStr(optObj(header.league)?.name);
  const venue = optStr(optObj(optObj(root.gameInfo)?.venue)?.fullName);
  return { ...(league ? { competition: league } : {}), ...(venue ? { venue } : {}), events, lineups, stats };
}

/** Il riassunto di una partita: eventi, formazioni e statistiche. */
export async function fetchSummary(league: string, eventId: string): Promise<ProviderDetails> {
  return parseSummary(await getJson(`/site/v2/sports/soccer/${league}/summary?event=${encodeURIComponent(eventId)}`));
}

/** Le squadre di una competizione, senza giovanili e femminili. */
export async function fetchTeamList(league: string): Promise<ProviderTeam[]> {
  const json = obj(await getJson(`/site/v2/sports/soccer/${league}/teams`), "teams");
  const sport = obj(arr(json.sports, "sports")[0], "sports[0]");
  const leagueObj = obj(arr(sport.leagues, "leagues")[0], "leagues[0]");
  return arr(leagueObj.teams, "teams")
    .map((entry) => parseTeam(obj(entry, "teams[]").team))
    .filter((team) => !NOT_SENIOR_MEN.test(team.name) && !NOT_SENIOR_MEN.test(team.shortName));
}

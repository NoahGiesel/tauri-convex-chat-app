/**
 * Il fornitore dei dati di calcio: tutte le chiamate a ESPN e la lettura delle risposte stanno qui.
 * Fuori da questo file circolano solo i nostri tipi, così un altro fornitore potrà sostituirlo.
 * ESPN non ha documentazione: ogni risposta si controlla, e un campo mancante è un errore
 * come una risposta non 200 (docs/adr/0001-espn-json-for-team-pins.md).
 */
import type { Doc } from "./_generated/dataModel";

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
  for (const c of arr(competition.competitors, "header.competitors").map((c) => obj(c, "header.competitors[]"))) {
    const homeAway = c.homeAway;
    if (homeAway !== "home" && homeAway !== "away") throw new EspnError("ESPN: header.competitors[].homeAway missing");
    sideOf.set(str(c.id, "header.competitors[].id"), homeAway);
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
    const names = (Array.isArray(e.participants) ? e.participants : []).map((p) =>
      str(obj(obj(p, "participants[]").athlete, "athlete").displayName, "athlete.displayName"),
    );
    events.push({
      kind,
      minute: str(obj(e.clock, "keyEvents[].clock").displayValue, "keyEvents[].clock.displayValue"),
      side: side(obj(e.team, "keyEvents[].team").id, "keyEvents[].team.id"),
      ...(names[0] ? { player: names[0] } : {}),
      ...(names[1] ? { other: names[1] } : {}),
    });
  }

  const lineups: ProviderDetails["lineups"] = [];
  for (const raw of Array.isArray(root.rosters) ? root.rosters : []) {
    const r = obj(raw, "rosters[]");
    const players = arr(r.roster, "rosters[].roster").map((p) => obj(p, "roster[]"));
    if (players.length === 0) continue;
    const toPlayer = (p: Obj): LineupPlayer => {
      const jersey = optStr(p.jersey);
      return { name: str(obj(p.athlete, "roster[].athlete").displayName, "roster[].athlete.displayName"), ...(jersey ? { jersey } : {}) };
    };
    const formation = optStr(r.formation);
    lineups.push({
      side: side(obj(r.team, "rosters[].team").id, "rosters[].team.id"),
      ...(formation ? { formation } : {}),
      starters: players.filter((p) => p.starter === true).map(toPlayer),
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

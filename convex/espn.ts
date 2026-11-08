/**
 * Il fornitore dei dati di calcio: tutte le chiamate a ESPN e la lettura delle risposte stanno qui.
 * Fuori da questo file circolano solo i nostri tipi, così un altro fornitore potrà sostituirlo.
 * ESPN non ha documentazione: ogni risposta si controlla, e un campo mancante è un errore
 * come una risposta non 200 (docs/adr/0001-espn-json-for-team-pins.md).
 */

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

/** Le squadre di una competizione, senza giovanili e femminili. */
export async function fetchTeamList(league: string): Promise<ProviderTeam[]> {
  const json = obj(await getJson(`/site/v2/sports/soccer/${league}/teams`), "teams");
  const sport = obj(arr(json.sports, "sports")[0], "sports[0]");
  const leagueObj = obj(arr(sport.leagues, "leagues")[0], "leagues[0]");
  return arr(leagueObj.teams, "teams")
    .map((entry) => parseTeam(obj(entry, "teams[]").team))
    .filter((team) => !NOT_SENIOR_MEN.test(team.name) && !NOT_SENIOR_MEN.test(team.shortName));
}

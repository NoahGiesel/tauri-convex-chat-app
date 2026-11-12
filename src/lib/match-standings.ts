import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { matchOutcome, opensMatch, scoreLine, type MatchOutcome, type ScheduleMatch, type TeamSchedule } from "./match-schedule";

/** La classifica di una competizione come la manda `footballStandings.forPin`. */
export type TeamStandings = NonNullable<FunctionReturnType<typeof api.footballStandings.forPin>>;
export type StandingsGroup = TeamStandings["groups"][number];
export type StandingsRow = StandingsGroup["rows"][number];
export type Competition = TeamSchedule["competitions"][number];
export type Zone = NonNullable<StandingsRow["zone"]>;

/** Una riga della tabella con quanto serve al disegno: la squadra pinnata e le altre squadre della chat. */
export type TableRow = StandingsRow & { selected: boolean; otherPin: boolean };

/** Dopo quanto senza classifica si smette di aspettare: la prima richiesta è fallita. */
export const STANDINGS_WAIT_MS = 2 * 60_000;

/** Un turno del percorso di una coppa: la partita, il turno e, se giocata, il risultato dall'angolo della squadra. */
export type PathStep = {
  match: ScheduleMatch;
  round: string;
  outcome: MatchOutcome | null;
  score: string | null;
  /** Solo una partita finita si apre nel tab Partita. */
  opens: boolean;
};

/** La tabella con la riga della squadra e le altre squadre pinnate segnate. */
export function tableRows(group: StandingsGroup, teamId: string, otherTeamIds: string[]): TableRow[] {
  return group.rows.map((row) => ({
    ...row,
    selected: row.teamId === teamId,
    otherPin: row.teamId !== teamId && otherTeamIds.includes(row.teamId),
  }));
}

/** La legenda delle zone, una per etichetta, nell'ordine in cui compaiono nella tabella. */
export function zoneLegend(rows: StandingsRow[]): Zone[] {
  const zones = new Map<string, Zone>();
  for (const row of rows) if (row.zone && !zones.has(row.zone.label)) zones.set(row.zone.label, row.zone);
  return [...zones.values()];
}

/** Un turno a eliminazione diretta: "Round of 16", "Quarterfinals", "Final", "Playoff Finals". */
export function isKnockoutRound(round: string): boolean {
  return /\b(round|quarter(?:-?finals?)?|semi(?:-?finals?)?|final|play-?offs?|knockout)\b/i.test(round);
}

/** Le partite della squadra in una competizione, dalla più vecchia alla più recente, senza doppioni. */
function leagueMatches(schedule: Pick<TeamSchedule, "results" | "fixtures">, league: string): ScheduleMatch[] {
  const byEvent = new Map<string, ScheduleMatch>();
  for (const match of [...schedule.results, ...schedule.fixtures]) {
    if (match.league === league && !byEvent.has(match.eventId)) byEvent.set(match.eventId, match);
  }
  return [...byEvent.values()].sort((a, b) => a.kickoff - b.kickoff);
}

/** Un turno del percorso, col risultato dall'angolo della squadra: un turno giocato si apre. */
function step(match: ScheduleMatch): PathStep {
  return {
    match,
    round: match.round,
    outcome: matchOutcome(match),
    score: scoreLine(match),
    opens: opensMatch(match),
  };
}

/** Il percorso di una coppa senza tabella: tutte le sue partite, dal primo turno. */
export function pathSteps(matches: ScheduleMatch[]): PathStep[] {
  return [...matches].sort((a, b) => a.kickoff - b.kickoff).map(step);
}

/**
 * La competizione della squadra con più partite: il campionato è ricavato dai dati, non da un elenco.
 * A parità di partite vince la prima nell'ordine dei chip.
 */
export function teamLeague(schedule: Pick<TeamSchedule, "results" | "fixtures">, competitions: Competition[]): string | null {
  const counts = new Map<string, number>();
  for (const match of [...schedule.results, ...schedule.fixtures]) counts.set(match.league, (counts.get(match.league) ?? 0) + 1);
  let league: string | null = null;
  let most = -1;
  for (const competition of competitions) {
    const count = counts.get(competition.league) ?? 0;
    if (count > most) {
      league = competition.league;
      most = count;
    }
  }
  return league;
}

/** La competizione su cui si apre il tab: quella del chip, altrimenti il campionato della squadra. */
export function initialLeague(competitions: readonly Competition[], chipLeague: string | undefined, teamLeagueId: string | null): string | null {
  if (chipLeague && competitions.some((competition) => competition.league === chipLeague)) return chipLeague;
  return teamLeagueId ?? competitions[0]?.league ?? null;
}

/** Quando la competizione scelta non ha niente da mostrare, il tab passa al campionato della squadra. */
export function fallbackLeague(league: string | null, nothingToShow: boolean, teamLeagueId: string | null): string | null {
  return nothingToShow && teamLeagueId && league !== teamLeagueId ? teamLeagueId : league;
}

/**
 * La competizione chiesta dal tab Classifica e la scelta da salvare. Dopo un cambio squadra la scelta
 * resta se la squadra mostrata la gioca, altrimenti diventa quella del chip della partita (in un derby,
 * la competizione del derby); senza una scelta vale `initialLeague`. Finché il calendario della squadra
 * mostrata carica la scelta resta, così la richiesta non oscilla tra le due competizioni
 * (docs/MATCH-DRAWER-SPEC.md, Derby).
 */
export function leagueRequest(
  picked: string | null,
  chipLeague: string | undefined,
  competitions: readonly Competition[],
  teamLeagueId: string | null,
  loading: boolean,
): { picked: string | null; requested: string | null } {
  const kept = picked === null || loading || competitions.some((competition) => competition.league === picked) ? picked : (chipLeague ?? null);
  return { picked: kept, requested: kept ?? initialLeague(competitions, chipLeague, teamLeagueId) };
}

/** Il chip acceso e se il tab mostra il campionato della squadra al posto della competizione chiesta. */
export function leagueChoice(
  requested: string | null,
  nothingToShow: boolean,
  teamLeagueId: string | null,
): { league: string | null; usingFallback: boolean } {
  const league = fallbackLeague(requested, nothingToShow, teamLeagueId);
  return { league, usingFallback: !!teamLeagueId && league === teamLeagueId && requested !== teamLeagueId };
}

/** La classifica non è ancora arrivata e il calendario è vecchio: la prima richiesta è fallita. */
export function waitingTooLong(
  standings: Pick<TeamStandings, "pending"> | null | undefined,
  schedule: Pick<TeamSchedule, "fetchedAt"> | null | undefined,
  now: number,
): boolean {
  return !!standings?.pending && !!schedule && schedule.fetchedAt != null && now - schedule.fetchedAt > STANDINGS_WAIT_MS;
}

/**
 * Cosa mostra il tab Classifica: la tabella, il percorso di una coppa senza tabella, oppure i turni a
 * eliminazione sopra la tabella finale di una coppa che ha già passato la fase campionato.
 */
export type StandingsView =
  | { kind: "table"; rows: TableRow[]; legend: Zone[] }
  | { kind: "path"; steps: PathStep[] }
  | { kind: "knockout"; steps: PathStep[]; rows: TableRow[]; legend: Zone[] }
  | { kind: "empty" };

export function standingsView({
  standings,
  schedule,
  teamId,
  otherTeamIds,
}: {
  standings: TeamStandings;
  schedule: Pick<TeamSchedule, "results" | "fixtures">;
  teamId: string;
  otherTeamIds: string[];
}): StandingsView {
  // La query manda solo il girone della squadra; la tabella è quello.
  const group = standings.groups[0];
  const matches = leagueMatches(schedule, standings.league);
  if (!group) {
    const steps = pathSteps(matches);
    return steps.length > 0 ? { kind: "path", steps } : { kind: "empty" };
  }
  const rows = tableRows(group, teamId, otherTeamIds);
  const legend = zoneLegend(group.rows);
  const steps = pathSteps(matches.filter((match) => isKnockoutRound(match.round)));
  // La testata "Fase campionato · finale" spetta a una fase campionato unica, non a un girone di una
  // competizione a gironi: quella tiene la sua tabella e basta.
  return steps.length > 0 && standings.groupCount === 1 ? { kind: "knockout", steps, rows, legend } : { kind: "table", rows, legend };
}

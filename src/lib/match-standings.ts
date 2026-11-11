import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { matchOutcome, opensMatch, scoreLine, type MatchOutcome, type ScheduleMatch, type TeamSchedule } from "./match-schedule";

/** La classifica di una competizione come la manda `footballStandings.forPin`. */
export type TeamStandings = NonNullable<FunctionReturnType<typeof api.footballStandings.forPin>>;
export type StandingsGroup = TeamStandings["groups"][number];
export type StandingsRow = StandingsGroup["rows"][number];
export type Competition = TeamSchedule["competitions"][number];
export type Zone = NonNullable<StandingsRow["zone"]>;

/** I campionati nazionali: la competizione su cui si apre il tab quando quella del chip non c'è. */
const DOMESTIC_LEAGUES = ["ita.1", "eng.1", "esp.1", "ger.1", "fra.1"];

/** Una riga della tabella con quanto serve al disegno: la squadra pinnata e le altre squadre della chat. */
export type TableRow = StandingsRow & { selected: boolean; otherPin: boolean };

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

/** Il percorso di una coppa senza tabella: i suoi turni a eliminazione, dal primo. */
export function pathSteps(matches: ScheduleMatch[]): PathStep[] {
  return matches
    .filter((match) => isKnockoutRound(match.round))
    .sort((a, b) => a.kickoff - b.kickoff)
    .map(step);
}

/** I turni a eliminazione di una coppa che ha già una tabella: si giocano dopo la fase campionato. */
export function knockoutSteps(matches: ScheduleMatch[]): PathStep[] {
  return pathSteps(matches);
}

/** La competizione su cui si apre il tab: quella del chip, altrimenti il campionato della squadra. */
export function initialLeague(competitions: Competition[], chipLeague: string | undefined): string | null {
  if (chipLeague && competitions.some((competition) => competition.league === chipLeague)) return chipLeague;
  const league = competitions.find((competition) => DOMESTIC_LEAGUES.includes(competition.league));
  return league?.league ?? competitions[0]?.league ?? null;
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
  const steps = knockoutSteps(matches);
  return steps.length > 0 ? { kind: "knockout", steps, rows, legend } : { kind: "table", rows, legend };
}

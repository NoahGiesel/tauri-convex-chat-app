import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { FRIENDLY_LEAGUES } from "../../convex/footballLeagues";

/** Il calendario di una squadra come lo manda `footballTeamSchedules.forPin`. */
export type TeamSchedule = NonNullable<FunctionReturnType<typeof api.footballTeamSchedules.forPin>>;
export type ScheduleMatch = TeamSchedule["results"][number];
/** Le due liste del tab Partite: le prossime partite e gli ultimi risultati. */
export type MatchesTabView = { next: ScheduleMatch[]; recent: ScheduleMatch[] };
export type MatchOutcome = "win" | "draw" | "loss";
type Score = { home: number; away: number };

const NEXT_COUNT = 3;
const RECENT_COUNT = 10;

/** Le sigle delle competizioni note: ESPN non manda la sigla corta del tab. */
const COMPETITION_TAGS: Record<string, string> = {
  "ita.1": "SA",
  "eng.1": "PL",
  "esp.1": "LL",
  "ger.1": "BL",
  "fra.1": "L1",
  "uefa.champions": "UCL",
  "uefa.europa": "UEL",
  "uefa.europa.conf": "UECL",
  "ita.coppa_italia": "CI",
  "ita.super_cup": "SCI",
  "uefa.nations": "UNL",
  "uefa.euro": "EURO",
  "fifa.world": "WC",
  "fifa.worldq.uefa": "WCQ",
  "fifa.cwc": "CWC",
  "club.friendly": "FR",
  "fifa.friendly": "FR",
};

const isFriendly = (match: ScheduleMatch) => FRIENDLY_LEAGUES.includes(match.league);

const bySoonest = (a: ScheduleMatch, b: ScheduleMatch) => a.kickoff - b.kickoff;

const byNewest = (a: ScheduleMatch, b: ScheduleMatch) => b.kickoff - a.kickoff;

/** Le prossime 3 partite e gli ultimi 10 risultati, dal più recente; le amichevoli restano solo fra le prossime. */
export function matchesTab(schedule: Pick<TeamSchedule, "results" | "fixtures">): MatchesTabView {
  return {
    next: schedule.fixtures.filter((m) => m.state !== "post").sort(bySoonest).slice(0, NEXT_COUNT),
    recent: schedule.results
      .filter((m) => !isFriendly(m) && m.state === "post")
      .sort(byNewest)
      .slice(0, RECENT_COUNT),
  };
}

/** I gol della squadra e quelli dell'avversario, nell'ordine della riga. */
function goals(match: ScheduleMatch, score: Score): [number, number] {
  return match.home ? [score.home, score.away] : [score.away, score.home];
}

/**
 * W, D o L dal lato della squadra; `null` finché la partita non è finita.
 * Una partita decisa ai rigori è una vittoria o una sconfitta, non un pareggio: conta il lato vincente di ESPN.
 */
export function matchOutcome(match: ScheduleMatch): MatchOutcome | null {
  if (match.state !== "post" || !match.score) return null;
  if (match.shootout && match.winner) return match.winner === (match.home ? "home" : "away") ? "win" : "loss";
  const [own, other] = goals(match, match.score);
  return own > other ? "win" : own < other ? "loss" : "draw";
}

/** "2–1" dal lato della squadra, col punteggio dei rigori fra parentesi quando c'era. */
export function scoreLine(match: ScheduleMatch): string | null {
  if (!match.score) return null;
  const [own, other] = goals(match, match.score);
  if (!match.shootout) return `${own}–${other}`;
  const [ownPens, otherPens] = goals(match, match.shootout);
  return `${own}–${other} (${ownPens}–${otherPens})`;
}

/**
 * Il testo a destra di una riga: il punteggio di una partita finita, altrimenti l'ora del calcio d'inizio
 * (o niente se ESPN non l'ha fissata). Una partita in corso non mostra il punteggio parziale.
 */
export function rowTail(match: ScheduleMatch, kickoffTime: string): string {
  if (match.state === "post") return scoreLine(match) ?? "";
  return match.timeValid === false ? "" : kickoffTime;
}

/** La sigla della competizione per la riga (`SA`, `UCL`, `CI`): quella nota, o le iniziali del nome. */
export function competitionTag(league: string, name: string): string {
  const known = COMPETITION_TAGS[league];
  if (known) return known;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

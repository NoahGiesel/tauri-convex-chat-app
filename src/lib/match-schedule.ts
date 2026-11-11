import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

/** Il calendario di una squadra come lo manda `footballTeamSchedules.forPin`. */
export type TeamSchedule = NonNullable<FunctionReturnType<typeof api.footballTeamSchedules.forPin>>;
export type ScheduleMatch = TeamSchedule["results"][number];
/** Le due liste del tab Partite: le prossime partite e gli ultimi risultati. */
export type MatchesTab = { next: ScheduleMatch[]; recent: ScheduleMatch[] };
export type MatchOutcome = "win" | "draw" | "loss";

/** Le competizioni che il tab Partite non mostra (docs/MATCH-DRAWER-SPEC.md, Matches tab). */
const FRIENDLY_LEAGUES = ["club.friendly", "fifa.friendly"];
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

/** Le prossime 3 partite e gli ultimi 10 risultati, senza amichevoli, dal più recente. */
export function matchesTab(schedule: Pick<TeamSchedule, "results" | "fixtures">): MatchesTab {
  return {
    next: schedule.fixtures.filter((m) => !isFriendly(m) && m.state !== "post").sort(bySoonest).slice(0, NEXT_COUNT),
    recent: schedule.results
      .filter((m) => !isFriendly(m) && m.state === "post")
      .sort(byNewest)
      .slice(0, RECENT_COUNT),
  };
}

/** I gol della squadra e quelli dell'avversario, nell'ordine della riga. */
function goals(match: ScheduleMatch, score: { home: number; away: number }): [number, number] {
  return match.home ? [score.home, score.away] : [score.away, score.home];
}

/** W, D o L dal lato della squadra; `null` se la partita non si è ancora giocata. */
export function matchOutcome(match: ScheduleMatch): MatchOutcome | null {
  if (match.state === "pre" || !match.score) return null;
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

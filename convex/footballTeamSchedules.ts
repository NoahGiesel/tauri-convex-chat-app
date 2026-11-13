import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, query, type MutationCtx } from "./_generated/server";
import { fetchSchedule, type ProviderCompetition, type ProviderSchedule } from "./espn";
import { canSeePinnedTeam } from "./model";
import { footballCompetition, footballScheduleMatch } from "./schema";

type ScheduleMatch = Doc<"footballTeamSchedules">["results"][number];

/** Più righe di quante l'app ne avrà mai: una per squadra pinnata. */
const MAX_SCHEDULES_SCANNED = 2000;

/** Le competizioni di due calendari, senza doppioni e nell'ordine in cui compaiono. */
export function mergeCompetitions(lists: ProviderCompetition[][]): ProviderCompetition[] {
  const byLeague = new Map<string, ProviderCompetition>();
  for (const competition of lists.flat()) if (!byLeague.has(competition.league)) byLeague.set(competition.league, competition);
  return [...byLeague.values()];
}

/**
 * Il calendario di una squadra, da ESPN: i risultati della stagione in corso e le partite in programma,
 * due richieste in tutto. Se una delle due fallisce la riga resta com'era e l'errore finisce nei log.
 */
export const refresh = internalAction({
  args: { teamId: v.string(), standings: v.optional(v.boolean()), standingsLeague: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const fetchedAt = Date.now();
    let results: ProviderSchedule;
    let fixtures: ProviderSchedule;
    try {
      results = await fetchSchedule(args.teamId, "results");
      fixtures = await fetchSchedule(args.teamId, "fixtures");
    } catch (e) {
      console.error(`Calendario di ${args.teamId}:`, e instanceof Error ? e.message : e);
      return null;
    }
    const competitions = mergeCompetitions([results.competitions, fixtures.competitions]);
    await ctx.runMutation(internal.footballTeamSchedules.save, {
      teamId: args.teamId,
      results: results.matches,
      fixtures: fixtures.matches,
      competitions,
      fetchedAt,
    });
    // Al pin servono le classifiche di tutte le competizioni appena lette; dopo una partita solo quella
    // del suo campionato (3 richieste in tutto, come da spec). Il cron delle 6 ore le chiede da sé.
    // Un campionato con una partita in corso aspetta: la classifica non cambia durante la partita.
    const wanted = new Set<string>();
    if (args.standings) for (const competition of competitions) wanted.add(competition.league);
    if (args.standingsLeague) wanted.add(args.standingsLeague);
    if (wanted.size > 0) {
      const live = new Set(await ctx.runQuery(internal.footballMatches.liveLeagueNames, {}));
      for (const league of wanted) {
        if (!live.has(league)) await ctx.scheduler.runAfter(0, internal.footballStandings.refreshLeague, { league });
      }
    }
    return null;
  },
});

/** Scrive il calendario di una squadra, o lo sostituisce se c'era già. */
export const save = internalMutation({
  args: {
    teamId: v.string(),
    results: v.array(footballScheduleMatch),
    fixtures: v.array(footballScheduleMatch),
    competitions: v.array(footballCompetition),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("footballTeamSchedules")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
    if (existing) await ctx.db.replace("footballTeamSchedules", existing._id, args);
    else await ctx.db.insert("footballTeamSchedules", args);
    return null;
  },
});

/** Toglie il calendario di una squadra che nessuna chat pinna più. */
export async function deleteUnpinnedSchedules(ctx: MutationCtx): Promise<void> {
  let scanned = 0;
  for await (const row of ctx.db.query("footballTeamSchedules")) {
    if (++scanned > MAX_SCHEDULES_SCANNED) return;
    const pin = await ctx.db
      .query("teamPins")
      .withIndex("by_teamId", (q) => q.eq("teamId", row.teamId))
      .first();
    if (!pin) await ctx.db.delete("footballTeamSchedules", row._id);
  }
}

/**
 * Il calendario con l'ultima partita della squadra fra i risultati. ESPN mette una partita finita nel calendario
 * anche ore dopo il fischio finale (Italia-Francia del 12 novembre 2026 mancava ancora quattro ore dopo), mentre
 * `footballMatches` ha già il risultato: la partita passa dalle prossime ai risultati, col turno e la competizione
 * della riga che il calendario aveva prima del calcio d'inizio, se c'era.
 */
export function withLastMatch(
  schedule: Pick<Doc<"footballTeamSchedules">, "results" | "fixtures" | "competitions">,
  teamId: string,
  last: Doc<"footballMatches"> | null,
): { results: ScheduleMatch[]; fixtures: ScheduleMatch[] } {
  const { results, fixtures } = schedule;
  if (!last || last.state !== "post" || results.some((m) => m.eventId === last.eventId)) return { results, fixtures };
  const home = last.home.teamId === teamId;
  if (!home && last.away.teamId !== teamId) return { results, fixtures };
  const before = fixtures.find((m) => m.eventId === last.eventId);
  const competition = schedule.competitions.find((c) => c.league === last.league);
  const winner = last.shootout ? sideAhead(last.shootout) : last.score ? sideAhead(last.score) : undefined;
  const finished: ScheduleMatch = {
    eventId: last.eventId,
    kickoff: last.kickoff,
    league: last.league,
    leagueName: before?.leagueName ?? competition?.shortName ?? last.league,
    round: before?.round ?? "",
    opponent: home ? last.away : last.home,
    home,
    state: "post",
    statusName: last.statusName,
    ...(last.score ? { score: last.score } : {}),
    ...(last.shootout ? { shootout: last.shootout } : {}),
    ...(winner ? { winner } : {}),
  };
  return { results: [finished, ...results], fixtures: fixtures.filter((m) => m.eventId !== last.eventId) };
}

/** Il lato avanti nel punteggio; `undefined` in parità. */
function sideAhead(score: { home: number; away: number }): "home" | "away" | undefined {
  return score.home > score.away ? "home" : score.away > score.home ? "away" : undefined;
}

/**
 * Il calendario di una squadra pinnata nel drawer: risultati, partite in programma e competizioni.
 * `null` se chi chiede non è nella chat o la chat non pinna la squadra; `pending` finché la prima riga
 * non è arrivata, così il tab sa di dover aspettare invece di dire che non ci sono partite.
 */
export const forPin = query({
  args: { conversationId: v.id("conversations"), teamId: v.string() },
  handler: async (ctx, args) => {
    if (!(await canSeePinnedTeam(ctx, args.conversationId, args.teamId))) return null;
    const row = await ctx.db
      .query("footballTeamSchedules")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
    const team = await ctx.db
      .query("footballTeams")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
    const last = team?.lastMatchId ? await ctx.db.get("footballMatches", team.lastMatchId) : null;
    const { results, fixtures } = row ? withLastMatch(row, args.teamId, last) : { results: [], fixtures: [] };
    return {
      teamId: args.teamId,
      pending: row === null,
      results,
      fixtures,
      competitions: row?.competitions ?? [],
      fetchedAt: row?.fetchedAt ?? null,
    };
  },
});

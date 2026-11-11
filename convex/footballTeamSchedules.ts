import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, query, type MutationCtx } from "./_generated/server";
import { fetchSchedule, type ProviderCompetition, type ProviderSchedule } from "./espn";
import { canSeePinnedTeam } from "./model";
import { footballCompetition, footballScheduleMatch } from "./schema";

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
  args: { teamId: v.string(), standings: v.optional(v.boolean()) },
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
    // Al pin e dopo una partita servono subito le classifiche delle competizioni appena lette. Il cron
    // delle 6 ore le chiede da sé, una volta per campionato, così due squadre non chiedono la stessa due volte.
    // Un campionato con una partita in corso aspetta: la classifica non cambia durante la partita.
    if (args.standings) {
      const live = new Set(await ctx.runQuery(internal.footballMatches.liveLeagueNames, {}));
      for (const competition of competitions) {
        if (!live.has(competition.league)) {
          await ctx.scheduler.runAfter(0, internal.footballStandings.refreshLeague, { league: competition.league });
        }
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
    return {
      teamId: args.teamId,
      pending: row === null,
      results: row?.results ?? [],
      fixtures: row?.fixtures ?? [],
      competitions: row?.competitions ?? [],
      fetchedAt: row?.fetchedAt ?? null,
    };
  },
});

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";
import { fetchSchedule, type ProviderCompetition, type ProviderSchedule } from "./espn";
import { getProfile } from "./model";
import { footballCompetition, footballScheduleMatch } from "./schema";

/** Più righe di quante l'app ne avrà mai: una per squadra pinnata. */
const MAX_SCHEDULES_SCANNED = 2000;

/** Le competizioni di due calendari, senza doppioni e nell'ordine in cui compaiono. */
function mergeCompetitions(lists: ProviderCompetition[][]): ProviderCompetition[] {
  const byLeague = new Map<string, ProviderCompetition>();
  for (const competition of lists.flat()) if (!byLeague.has(competition.league)) byLeague.set(competition.league, competition);
  return [...byLeague.values()];
}

/**
 * Il calendario di una squadra, da ESPN: i risultati della stagione in corso e le partite in programma,
 * due richieste in tutto. Se una delle due fallisce la riga resta com'era e l'errore finisce nei log.
 */
export const refresh = internalAction({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    const fetchedAt = Date.now();
    let results: ProviderSchedule;
    let fixtures: ProviderSchedule;
    try {
      results = await fetchSchedule(args.teamId, false);
      fixtures = await fetchSchedule(args.teamId, true);
    } catch (e) {
      console.error(`Calendario di ${args.teamId}:`, e instanceof Error ? e.message : e);
      return null;
    }
    await ctx.runMutation(internal.footballTeamSchedules.save, {
      teamId: args.teamId,
      results: results.matches,
      fixtures: fixtures.matches,
      competitions: mergeCompetitions([results.competitions, fixtures.competitions]),
      fetchedAt,
    });
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

/** Ogni giorno, insieme alla pulizia delle partite: toglie il calendario di una squadra che nessuna chat pinna. */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    let scanned = 0;
    for await (const row of ctx.db.query("footballTeamSchedules")) {
      if (++scanned > MAX_SCHEDULES_SCANNED) return null;
      const pin = await ctx.db
        .query("teamPins")
        .withIndex("by_teamId", (q) => q.eq("teamId", row.teamId))
        .first();
      if (!pin) await ctx.db.delete("footballTeamSchedules", row._id);
    }
    return null;
  },
});

/**
 * Il calendario di una squadra pinnata nel drawer: risultati, partite in programma e competizioni.
 * `null` se chi chiede non è nella chat, la chat non pinna la squadra, o il calendario non è ancora arrivato.
 */
export const forPin = query({
  args: { conversationId: v.id("conversations"), teamId: v.string() },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return null;
    const pin = await ctx.db
      .query("teamPins")
      .withIndex("by_conversation_and_teamId", (q) => q.eq("conversationId", args.conversationId).eq("teamId", args.teamId))
      .first();
    if (!pin) return null;
    const row = await ctx.db
      .query("footballTeamSchedules")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
    if (!row) return null;
    return {
      teamId: row.teamId,
      results: row.results,
      fixtures: row.fixtures,
      competitions: row.competitions,
      fetchedAt: row.fetchedAt,
    };
  },
});

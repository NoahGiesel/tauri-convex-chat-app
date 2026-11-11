import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";
import { fetchStandings, type ProviderStandings } from "./espn";
import { getProfile } from "./model";
import { footballStandingsGroup } from "./schema";

/** Quante stagioni salvate si possono trovare per una competizione: una per stagione toccata. */
const MAX_SEASONS_SCANNED = 50;

/**
 * La classifica di una competizione da ESPN. Se la richiesta fallisce la riga resta com'era e l'errore
 * finisce nei log, come per il calendario.
 */
export const refreshLeague = internalAction({
  args: { league: v.string() },
  handler: async (ctx, args) => {
    const fetchedAt = Date.now();
    let standings: ProviderStandings;
    try {
      standings = await fetchStandings(args.league);
    } catch (e) {
      console.error(`Classifica di ${args.league}:`, e instanceof Error ? e.message : e);
      return null;
    }
    await ctx.runMutation(internal.footballStandings.save, { league: args.league, ...standings, fetchedAt });
    return null;
  },
});

/** Scrive la classifica di una competizione e stagione, o sostituisce quella che c'era. */
export const save = internalMutation({
  args: {
    league: v.string(),
    season: v.string(),
    endDate: v.number(),
    groups: v.array(footballStandingsGroup),
    fetchedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("footballStandings")
      .withIndex("by_league_and_season", (q) => q.eq("league", args.league).eq("season", args.season))
      .unique();
    if (existing) await ctx.db.replace("footballStandings", existing._id, args);
    else await ctx.db.insert("footballStandings", args);
    return null;
  },
});

/**
 * La classifica di una competizione per il drawer: una tabella, o solo il girone della squadra quando la
 * competizione è fatta di gironi. `null` se chi chiede non è nella chat o la chat non pinna la squadra.
 * Una tabella di un'altra stagione non è la sua: resta fuori, perché ESPN la può restituire anni dopo.
 * `pending` finché una classifica per la competizione non è arrivata, così il tab sa di dover aspettare.
 */
export const forPin = query({
  args: { conversationId: v.id("conversations"), teamId: v.string(), league: v.string() },
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

    const schedule = await ctx.db
      .query("footballTeamSchedules")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
    const competition = schedule?.competitions.find((c) => c.league === args.league);
    const rows = await ctx.db
      .query("footballStandings")
      .withIndex("by_league", (q) => q.eq("league", args.league))
      .take(MAX_SEASONS_SCANNED);
    const current = competition ? rows.find((row) => row.season === competition.season) : undefined;
    const group = current?.groups.find((g) => g.rows.some((r) => r.teamId === args.teamId));
    return {
      league: args.league,
      pending: rows.length === 0,
      season: competition?.season ?? null,
      endDate: current?.endDate ?? null,
      groups: group ? [group] : [],
      fetchedAt: current?.fetchedAt ?? null,
    };
  },
});

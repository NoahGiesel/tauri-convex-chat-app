import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fetchNextMatch, type ProviderMatch } from "./espn";

/** Più pin di quanti l'app ne avrà mai: ogni chat ne ha al massimo 3. */
const MAX_PINS_SCANNED = 5000;

const sideValidator = v.object({
  teamId: v.string(),
  name: v.string(),
  shortName: v.string(),
  abbreviation: v.string(),
  logo: v.optional(v.string()),
});
const scoreValidator = v.object({ home: v.number(), away: v.number() });

export const matchValidator = v.object({
  eventId: v.string(),
  league: v.string(),
  home: sideValidator,
  away: sideValidator,
  kickoff: v.number(),
  state: v.union(v.literal("pre"), v.literal("in"), v.literal("post")),
  statusName: v.string(),
  score: v.optional(scoreValidator),
  shootout: v.optional(scoreValidator),
  clock: v.optional(v.string()),
});

/** Scrive (o aggiorna) una partita, una sola riga per partita ESPN. */
export async function upsertMatch(ctx: MutationCtx, match: ProviderMatch, fetchedAt: number): Promise<Id<"footballMatches">> {
  const existing = await ctx.db
    .query("footballMatches")
    .withIndex("by_eventId", (q) => q.eq("eventId", match.eventId))
    .unique();
  const row = { score: undefined, shootout: undefined, clock: undefined, ...match, fetchedAt };
  if (existing) {
    await ctx.db.replace("footballMatches", existing._id, row);
    return existing._id;
  }
  return await ctx.db.insert("footballMatches", row);
}

export async function teamRow(ctx: QueryCtx, teamId: string): Promise<Doc<"footballTeams"> | null> {
  return await ctx.db
    .query("footballTeams")
    .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
    .unique();
}

/** Chiede a ESPN la prossima partita di una squadra. Se la richiesta fallisce non cambia niente: riprova il prossimo giro. */
export const refreshNextMatch = internalAction({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    let match: ProviderMatch | null;
    try {
      match = await fetchNextMatch(args.teamId);
    } catch (e) {
      console.error(`Prossima partita di ${args.teamId}:`, e instanceof Error ? e.message : e);
      return null;
    }
    await ctx.runMutation(internal.footballMatches.saveNextMatch, { teamId: args.teamId, match });
    return null;
  },
});

export const saveNextMatch = internalMutation({
  args: { teamId: v.string(), match: v.union(matchValidator, v.null()) },
  handler: async (ctx, args) => {
    const team = await teamRow(ctx, args.teamId);
    if (!team) return null;
    const nextMatchId = args.match ? await upsertMatch(ctx, args.match, Date.now()) : undefined;
    await ctx.db.patch("footballTeams", team._id, { nextMatchId });
    return null;
  },
});

/** Ogni 6 ore: la prossima partita di ogni squadra pinnata (una richiesta per squadra, anche se è pinnata in più chat). */
export const refreshPinnedTeams = internalMutation({
  args: {},
  handler: async (ctx) => {
    const pins = await ctx.db.query("teamPins").take(MAX_PINS_SCANNED);
    for (const teamId of new Set(pins.map((pin) => pin.teamId))) {
      await ctx.scheduler.runAfter(0, internal.footballMatches.refreshNextMatch, { teamId });
    }
    return null;
  },
});

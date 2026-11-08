import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { fetchNextMatch, type ProviderMatch } from "./espn";
import { teamRow } from "./footballTeams";
import schema from "./schema";

/** Più pin di quanti l'app ne avrà mai: ogni chat ne ha al massimo 3. */
const MAX_PINS_SCANNED = 5000;

/** Una partita come la manda il fornitore: la riga di `footballMatches` senza `fetchedAt`. */
export const matchValidator = schema.tables.footballMatches.validator.omit("fetchedAt");

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

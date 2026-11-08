import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { teamRow } from "./footballTeams";
import { fail, getProfile, requireMember, requireProfile } from "./model";

/** Squadre pinnate al massimo in una chat (docs/TEAM-PINS-SPEC.md, Rules). */
export const MAX_TEAM_PINS = 3;

/** La riga di sistema che racconta un pin aggiunto o tolto. Non sposta la chat e non conta come non letta. */
async function insertSystemLine(ctx: MutationCtx, conversationId: Id<"conversations">, system: NonNullable<Doc<"messages">["system"]>) {
  await ctx.db.insert("messages", { conversationId, kind: "system", body: "", system });
}

/** `/calcio`: pinna una squadra in una chat diretta. Chiunque dei due può farlo. */
export const add = mutation({
  args: { conversationId: v.id("conversations"), teamId: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation) throw fail("not_member");
    await requireMember(ctx, args.conversationId, me._id);
    if (conversation.kind !== "direct") throw fail("team_pins_direct_only");

    const team = await teamRow(ctx, args.teamId);
    if (!team?.listed) throw fail("unknown_team");
    const duplicate = await ctx.db
      .query("teamPins")
      .withIndex("by_conversation_and_teamId", (q) => q.eq("conversationId", args.conversationId).eq("teamId", args.teamId))
      .first();
    if (duplicate) throw fail("team_already_pinned");
    const pins = await ctx.db
      .query("teamPins")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(MAX_TEAM_PINS);
    if (pins.length >= MAX_TEAM_PINS) throw fail("too_many_team_pins");

    const pinId = await ctx.db.insert("teamPins", {
      conversationId: args.conversationId,
      teamId: args.teamId,
      pinnedBy: me._id,
      pinnedAt: Date.now(),
    });
    await insertSystemLine(ctx, args.conversationId, { action: "pinned", profileId: me._id, teamName: team.name });
    await ctx.scheduler.runAfter(0, internal.footballMatches.refreshNextMatch, { teamId: args.teamId });
    return pinId;
  },
});

/** Toglie una squadra pinnata: può farlo chiunque dei due, non solo chi l'ha pinnata. */
export const remove = mutation({
  args: { pinId: v.id("teamPins") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const pin = await ctx.db.get("teamPins", args.pinId);
    if (!pin) return null;
    await requireMember(ctx, pin.conversationId, me._id);
    const team = await teamRow(ctx, pin.teamId);
    await ctx.db.delete("teamPins", pin._id);
    await insertSystemLine(ctx, pin.conversationId, { action: "unpinned", profileId: me._id, teamName: team?.name ?? pin.teamId });
    return null;
  },
});

/** Quanto il client mostra di una squadra (nell'indice o in una partita). */
const teamView = (s: Doc<"footballMatches">["home"]) => ({
  teamId: s.teamId,
  name: s.name,
  shortName: s.shortName,
  abbreviation: s.abbreviation,
  logo: s.logo ?? null,
});

/** Quanto il client mostra di una partita: squadre, stato, punteggio e quando è stata letta l'ultima volta. */
const matchView = (m: Doc<"footballMatches">) => ({
  eventId: m.eventId,
  kickoff: m.kickoff,
  state: m.state,
  statusName: m.statusName,
  home: teamView(m.home),
  away: teamView(m.away),
  score: m.score ?? null,
  shootout: m.shootout ?? null,
  clock: m.clock ?? null,
  fetchedAt: m.fetchedAt,
});

/** Le squadre pinnate in una chat, nell'ordine in cui sono state aggiunte, ognuna con la sua prossima partita. */
export const list = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return [];
    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return [];

    const pins = await ctx.db
      .query("teamPins")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(MAX_TEAM_PINS);
    const result = [];
    for (const pin of pins) {
      const team = await teamRow(ctx, pin.teamId);
      if (!team) continue;
      const next = team.nextMatchId ? await ctx.db.get("footballMatches", team.nextMatchId) : null;
      const last = team.lastMatchId ? await ctx.db.get("footballMatches", team.lastMatchId) : null;
      result.push({
        pinId: pin._id,
        pinnedAt: pin.pinnedAt,
        team: teamView(team),
        // Quale delle due mostrare lo decide il client, che conosce l'ora (le query non la leggono).
        lastMatch: last ? matchView(last) : null,
        nextMatch: next ? matchView(next) : null,
      });
    }
    return result; // l'indice le dà già nell'ordine in cui sono state aggiunte
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getProfile, requireMember, requireProfile } from "./model";

const TTL_MS = 6_000;

/** Segnala che sto scrivendo (il client la richiama ogni pochi secondi finché scrive). */
export const ping = mutation({
  args: { conversationId: v.id("conversations"), active: v.boolean() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const row = await ctx.db
      .query("typing")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId).eq("profileId", me._id))
      .unique();
    const until = args.active ? Date.now() + TTL_MS : 0;
    if (row) await ctx.db.patch("typing", row._id, { until });
    else if (args.active) await ctx.db.insert("typing", { conversationId: args.conversationId, profileId: me._id, until });
  },
});

/** Gli altri membri che stanno scrivendo; il client scarta quelli con `until` già passato. */
export const list = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return [];
    await requireMember(ctx, args.conversationId, me._id);
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId))
      .take(20);
    const out: { name: string; until: number }[] = [];
    for (const r of rows) {
      if (r.profileId === me._id || r.until === 0) continue;
      const p = await ctx.db.get("profiles", r.profileId);
      if (p) out.push({ name: p.name, until: r.until });
    }
    return out;
  },
});

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { fail, requireMember, requireProfile } from "./model";

export const MAX_REACTIONS_PER_MESSAGE = 300;
const MAX_DISTINCT_EMOJI = 20;

/** Una sola emoji: anche con tono della pelle, sequenze (famiglie, professioni…) o bandiere. */
const SINGLE_EMOJI =
  /^(?:\p{Extended_Pictographic}[\ufe0f\u{1F3FB}-\u{1F3FF}]?(?:\u200d\p{Extended_Pictographic}[\ufe0f\u{1F3FB}-\u{1F3FF}]?)*|[\u{1F1E6}-\u{1F1FF}]{2})$/u;

/** Aggiunge la mia reazione a un messaggio, o la toglie se l'avevo già messa. */
export const toggle = mutation({
  args: { messageId: v.id("messages"), emoji: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const message = await ctx.db.get("messages", args.messageId);
    if (!message) throw fail("message_not_found");
    await requireMember(ctx, message.conversationId, me._id);

    const emoji = args.emoji.trim();
    if (emoji.length > 32 || !SINGLE_EMOJI.test(emoji)) throw fail("invalid_emoji");

    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_and_profile_and_emoji", (q) =>
        q.eq("messageId", message._id).eq("profileId", me._id).eq("emoji", emoji),
      )
      .unique();
    if (existing) {
      await ctx.db.delete("reactions", existing._id);
      return;
    }

    const all = await ctx.db
      .query("reactions")
      .withIndex("by_message", (q) => q.eq("messageId", message._id))
      .take(MAX_REACTIONS_PER_MESSAGE);
    if (!all.some((r) => r.emoji === emoji) && new Set(all.map((r) => r.emoji)).size >= MAX_DISTINCT_EMOJI) {
      throw fail("too_many_reactions");
    }
    await ctx.db.insert("reactions", { messageId: message._id, profileId: me._id, emoji });
  },
});

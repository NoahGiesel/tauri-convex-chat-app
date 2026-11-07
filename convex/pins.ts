import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, getProfile, requireMember, requireProfile } from "./model";

export const MAX_PINS_PER_CONVERSATION = 50;
const PREVIEW_LENGTH = 160;

/** Pinna un messaggio per tutti i membri della chat. */
export const pin = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const message = await ctx.db.get("messages", args.messageId);
    if (!message) throw fail("message_not_found");
    await requireMember(ctx, message.conversationId, me._id);
    if (message.kind !== "text" && message.kind !== "gif" && message.kind !== "media") throw fail("cannot_pin");

    const existing = await ctx.db
      .query("pins")
      .withIndex("by_message", (q) => q.eq("messageId", message._id))
      .first();
    if (existing) throw fail("already_pinned");

    const all = await ctx.db
      .query("pins")
      .withIndex("by_conversation", (q) => q.eq("conversationId", message.conversationId))
      .take(MAX_PINS_PER_CONVERSATION);
    if (all.length >= MAX_PINS_PER_CONVERSATION) throw fail("too_many_pins");

    await ctx.db.insert("pins", {
      conversationId: message.conversationId,
      messageId: message._id,
      pinnedBy: me._id,
      pinnedAt: Date.now(),
    });
  },
});

/** Toglie il pin: può farlo solo chi lo ha messo. */
export const unpin = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const pin = await ctx.db
      .query("pins")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .first();
    if (!pin) return; // già tolto (anche da un altro dispositivo)
    await requireMember(ctx, pin.conversationId, me._id);
    if (pin.pinnedBy !== me._id) throw fail("not_pin_owner");
    await ctx.db.delete("pins", pin._id);
  },
});

/** Messaggi pinnati della conversazione, dal più recente. */
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

    const rows = await ctx.db
      .query("pins")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(MAX_PINS_PER_CONVERSATION);

    const names = new Map<string, string>();
    const nameOf = async (id: typeof me._id) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get("profiles", id))?.name ?? "?");
      return names.get(id)!;
    };

    const out = [];
    for (const row of rows) {
      const message = await ctx.db.get("messages", row.messageId);
      if (!message) continue;
      out.push({
        messageId: message._id,
        kind: message.kind,
        preview: message.kind === "gif" ? "" : message.body.slice(0, PREVIEW_LENGTH),
        attachmentCount: message.attachments?.length ?? (message.media ? 1 : 0),
        authorName: message.authorId ? await nameOf(message.authorId) : "?",
        pinnedByName: await nameOf(row.pinnedBy),
        pinnedByMe: row.pinnedBy === me._id,
        pinnedAt: row.pinnedAt,
      });
    }
    return out;
  },
});

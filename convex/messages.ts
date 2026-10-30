import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { fail, getProfile, requireMember, requireProfile } from "./model";

const MAX_BODY = 4000;
const MAX_MEMBERS = 50;

/** Messaggi di una conversazione, dal più recente, paginati (infinite scroll verso l'alto). */
export const list = query({
  args: { conversationId: v.id("conversations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    const empty = { page: [], isDone: true, continueCursor: "" };
    if (!me) return empty;

    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return empty;

    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .paginate(args.paginationOpts);

    const authors = new Map<Id<"profiles">, { name: string; avatarIndex: number } | null>();
    const page = [];
    for (const message of result.page) {
      let author = null;
      if (message.authorId) {
        if (!authors.has(message.authorId)) {
          const p = await ctx.db.get("profiles", message.authorId);
          authors.set(message.authorId, p ? { name: p.name, avatarIndex: p.avatarIndex } : null);
        }
        author = authors.get(message.authorId) ?? null;
      }
      page.push({
        _id: message._id,
        _creationTime: message._creationTime,
        kind: message.kind,
        body: message.body,
        authorId: message.authorId ?? null,
        authorName: author?.name ?? (message.kind === "ai" ? "AI" : "Utente rimosso"),
        authorAvatarIndex: author?.avatarIndex ?? 0,
        mine: message.authorId === me._id,
      });
    }
    return { ...result, page };
  },
});

/** Invia un messaggio di testo. */
export const send = mutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);

    const body = args.body.trim();
    if (body.length === 0) throw fail("message_empty");
    if (body.length > MAX_BODY) throw fail("message_too_long");

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      authorId: me._id,
      kind: "text",
      body,
    });

    await ctx.db.patch("conversations", args.conversationId, { lastMessageAt: now });

    // Aggiorna l'ordinamento della lista chat di ogni membro; per chi scrive il messaggio è già letto.
    const members = await ctx.db
      .query("members")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(MAX_MEMBERS);
    for (const m of members) {
      await ctx.db.patch("members", m._id, m.profileId === me._id ? { lastMessageAt: now, lastReadAt: now } : { lastMessageAt: now });
    }
    return messageId;
  },
});

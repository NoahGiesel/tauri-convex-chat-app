import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { carriesLinks, extractLinks } from "./linkRules";
import { requireMember, requireProfile } from "./model";
import { signedReadUrl } from "./r2";

const MAX_LINKS_PER_MESSAGE = 5;

/** Nome dell'autore con una cache per non rileggere lo stesso profilo. */
function nameLookup(ctx: QueryCtx) {
  const cache = new Map<Id<"profiles">, string>();
  return async (id: Id<"profiles"> | undefined): Promise<string> => {
    if (!id) return "?";
    if (!cache.has(id)) cache.set(id, (await ctx.db.get("profiles", id))?.name ?? "?");
    return cache.get(id)!;
  };
}

/** Foto e video di una chat, dal più recente (un elemento per messaggio, con tutti i suoi allegati). */
export const media = query({
  args: { conversationId: v.id("conversations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const nameOf = nameLookup(ctx);

    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversation_and_kind", (q) => q.eq("conversationId", args.conversationId).eq("kind", "media"))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = [];
    for (const m of result.page) {
      const files = m.attachments ?? (m.media ? [{ ...m.media, name: m.body }] : []);
      page.push({
        _id: m._id,
        _creationTime: m._creationTime,
        authorName: await nameOf(m.authorId),
        attachments: await Promise.all(
          files.map(async (a) => ({ url: await signedReadUrl(a.key), type: a.type, name: a.name, size: a.size })),
        ),
      });
    }
    return { ...result, page };
  },
});

/** Link scritti in una chat, dal più recente, con titolo e immagine se l'anteprima è già stata scaricata. */
export const links = query({
  args: { conversationId: v.id("conversations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const nameOf = nameLookup(ctx);

    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversation_and_hasLink", (q) => q.eq("conversationId", args.conversationId).eq("hasLink", true))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = [];
    for (const m of result.page) {
      const items = [];
      for (const url of extractLinks(m.body).slice(0, MAX_LINKS_PER_MESSAGE)) {
        const preview = await ctx.db.query("linkPreviews").withIndex("by_url", (q) => q.eq("url", url)).unique();
        items.push({
          url,
          title: preview?.ok ? (preview.title ?? null) : null,
          siteName: preview?.ok ? (preview.siteName ?? null) : null,
          image: preview?.ok ? (preview.image ?? null) : null,
        });
      }
      page.push({ _id: m._id, _creationTime: m._creationTime, authorName: await nameOf(m.authorId), links: items });
    }
    return { ...result, page };
  },
});

/**
 * Una tantum, per i messaggi scritti prima di questa funzione:
 * `npx convex run library:backfillLinks` (e con `--prod` in produzione).
 */
export const backfillLinks = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<null> => {
    const result = await ctx.db.query("messages").paginate({ numItems: 200, cursor: args.cursor ?? null });
    for (const m of result.page) {
      if (m.hasLink === undefined && carriesLinks(m.kind, m.style, m.body)) await ctx.db.patch("messages", m._id, { hasLink: true });
    }
    if (!result.isDone) await ctx.scheduler.runAfter(0, internal.library.backfillLinks, { cursor: result.continueCursor });
    return null;
  },
});

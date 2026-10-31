import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { avatarUrl, fail, getProfile, requireMember, requireProfile } from "./model";
import { MAX_REACTIONS_PER_MESSAGE } from "./reactions";
import { internal } from "./_generated/api";
import { carriesLinks } from "./linkRules";
import { classifyMedia } from "./mediaRules";
import { signedReadUrl } from "./r2";

const MAX_BODY = 4000;
const MAX_MEMBERS = 50;
const MAX_GIF_URL = 500;

/** Salva il messaggio e aggiorna ordinamento e non letti di ogni membro. */
async function postMessage(
  ctx: MutationCtx,
  me: Doc<"profiles">,
  conversationId: Id<"conversations">,
  kind: "text" | "gif" | "media",
  body: string,
  style?: Doc<"messages">["style"],
  media?: Doc<"messages">["media"],
  attachments?: Doc<"messages">["attachments"],
) {
  const now = Date.now();
  const messageId = await ctx.db.insert("messages", { conversationId, authorId: me._id, kind, body, style, media, attachments, hasLink: carriesLinks(kind, style, body) ? true : undefined });
  await ctx.db.patch("conversations", conversationId, { lastMessageAt: now });

  // Aggiorna l'ordinamento della lista chat di ogni membro; per chi scrive il messaggio è già letto.
  const members = await ctx.db
    .query("members")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .take(MAX_MEMBERS);
  for (const m of members) {
    await ctx.db.patch("members", m._id, m.profileId === me._id ? { lastMessageAt: now, lastReadAt: now } : { lastMessageAt: now });
  }
  return messageId;
}

/** Solo indirizzi https su un sottodominio di giphy.com: nessun altro sito può farsi caricare dai client degli amici. */
function isGiphyUrl(raw: string): boolean {
  if (raw.length > MAX_GIF_URL) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname.endsWith(".giphy.com");
  } catch {
    return false;
  }
}

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

    const authors = new Map<Id<"profiles">, { name: string; avatarIndex: number; avatarUrl: string | null } | null>();
    const names = new Map<Id<"profiles">, string>();
    const nameOf = async (id: Id<"profiles">) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get("profiles", id))?.name ?? "?");
      return names.get(id)!;
    };
    const page = [];
    for (const message of result.page) {
      let author = null;
      if (message.authorId) {
        if (!authors.has(message.authorId)) {
          const p = await ctx.db.get("profiles", message.authorId);
          authors.set(message.authorId, p ? { name: p.name, avatarIndex: p.avatarIndex, avatarUrl: await avatarUrl(ctx, p) } : null);
        }
        author = authors.get(message.authorId) ?? null;
      }
      // Reazioni raggruppate per emoji, nell'ordine in cui sono comparse.
      const grouped = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>();
      const reactionRows = await ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", message._id))
        .take(MAX_REACTIONS_PER_MESSAGE);
      for (const r of reactionRows) {
        const g = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
        g.count += 1;
        g.mine ||= r.profileId === me._id;
        if (g.names.length < 10) g.names.push(await nameOf(r.profileId));
        grouped.set(r.emoji, g);
      }

      page.push({
        _id: message._id,
        _creationTime: message._creationTime,
        kind: message.kind,
        // Nei messaggi con allegati `body` è la didascalia; in quelli vecchi (un solo file) era il nome del file.
        body: message.kind === "media" && !message.attachments ? "" : message.body,
        authorId: message.authorId ?? null,
        authorName: author?.name ?? (message.kind === "ai" ? "AI" : "Utente rimosso"),
        authorAvatarIndex: author?.avatarIndex ?? 0,
        authorAvatarUrl: author?.avatarUrl ?? null,
        mine: message.authorId === me._id,
        reactions: [...grouped.values()],
        editedAt: message.editedAt ?? null,
        style: message.style ?? null,
        attachments: await Promise.all(
          (message.attachments ?? (message.media ? [{ ...message.media, name: message.body }] : [])).map(async (a) => ({
            url: await signedReadUrl(a.key),
            type: a.type,
            size: a.size,
            name: a.name,
          })),
        ),
      });
    }
    return { ...result, page };
  },
});

/** Invia un messaggio di testo. */
export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    /** Formato scelto con un comando: /me, /code, /pre, /spoiler, /quote. */
    style: v.optional(
      v.union(v.literal("me"), v.literal("code"), v.literal("pre"), v.literal("spoiler"), v.literal("quote")),
    ),
  },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);

    const body = args.body.trim();
    if (body.length === 0) throw fail("message_empty");
    if (body.length > MAX_BODY) throw fail("message_too_long");

    return await postMessage(ctx, me, args.conversationId, "text", body, args.style);
  },
});

/** Invia una GIF scelta da GIPHY. */
export const sendGif = mutation({
  args: { conversationId: v.id("conversations"), url: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    if (!isGiphyUrl(args.url)) throw fail("invalid_gif");
    return await postMessage(ctx, me, args.conversationId, "gif", args.url);
  },
});

/** L'autore modifica il testo di un proprio messaggio; resta il segno "(modificato)". */
export const edit = mutation({
  args: { messageId: v.id("messages"), body: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const message = await ctx.db.get("messages", args.messageId);
    if (!message) throw fail("message_not_found");
    await requireMember(ctx, message.conversationId, me._id);
    // I risultati di /random e /flip non si modificano.
    if (message.kind !== "text" || message.authorId !== me._id || message.style === "random" || message.style === "flip") {
      throw fail("cannot_edit");
    }

    const body = args.body.trim();
    if (body.length === 0) throw fail("message_empty");
    if (body.length > MAX_BODY) throw fail("message_too_long");
    if (body === message.body) return;

    await ctx.db.patch("messages", message._id, {
      body,
      editedAt: Date.now(),
      hasLink: carriesLinks(message.kind, message.style, body) ? true : undefined,
    });
  },
});

/** L'autore elimina del tutto un proprio messaggio (testo o GIF), reazioni comprese. */
export const remove = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const message = await ctx.db.get("messages", args.messageId);
    if (!message) return; // già eliminato (anche da un altro dispositivo)
    await requireMember(ctx, message.conversationId, me._id);
    if (message.kind === "ai" || message.authorId !== me._id) throw fail("cannot_delete");

    for (;;) {
      const batch = await ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", message._id))
        .take(256);
      if (batch.length === 0) break;
      for (const r of batch) await ctx.db.delete("reactions", r._id);
    }
    await ctx.db.delete("messages", message._id);
    for (const a of message.attachments ?? (message.media ? [message.media] : [])) {
      await ctx.scheduler.runAfter(0, internal.media.deleteObject, { key: a.key });
    }
  },
});

const MAX_RANDOM = 1_000_000_000;

/** `/random`: estrae un numero a caso tra min e max (il sorteggio lo fa il server, così nessuno può truccarlo). */
export const roll = mutation({
  args: { conversationId: v.id("conversations"), min: v.number(), max: v.number() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const { min, max } = args;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max || Math.abs(min) > MAX_RANDOM || Math.abs(max) > MAX_RANDOM) {
      throw fail("invalid_range");
    }
    const n = min + Math.floor(Math.random() * (max - min + 1));
    return await postMessage(ctx, me, args.conversationId, "text", `${n}|${min}|${max}`, "random");
  },
});

/** `/flip`: lancia una moneta. */
export const flip = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const side = Math.random() < 0.5 ? "heads" : "tails";
    return await postMessage(ctx, me, args.conversationId, "text", side, "flip");
  },
});

const MAX_ATTACHMENTS = 10;

/** Registra un messaggio con fino a 10 allegati già caricati su R2 (vedi `media.createUpload`) e una didascalia facoltativa. */
export const sendAttachments = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    files: v.array(v.object({ key: v.string(), mime: v.string(), size: v.number(), name: v.string() })),
  },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    if (args.files.length === 0) throw fail("invalid_media");
    if (args.files.length > MAX_ATTACHMENTS) throw fail("too_many_attachments");
    const caption = args.body.trim();
    if (caption.length > MAX_BODY) throw fail("message_too_long");

    const attachments = args.files.map((f) => {
      const check = classifyMedia(f.mime, f.size);
      if (!check.ok) throw fail(check.reason);
      // La chiave deve essere quella generata per questa chat, con l'estensione giusta.
      if (!f.key.startsWith(`${args.conversationId}/`) || !/^[A-Za-z0-9]+\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(f.key) || !f.key.endsWith(`.${check.ext}`)) {
        throw fail("invalid_media");
      }
      return { key: f.key, type: check.type, mime: f.mime, size: f.size, name: f.name.trim().slice(0, 120) || "file" };
    });
    if (new Set(attachments.map((a) => a.key)).size !== attachments.length) throw fail("invalid_media");
    return await postMessage(ctx, me, args.conversationId, "media", caption, undefined, undefined, attachments);
  },
});

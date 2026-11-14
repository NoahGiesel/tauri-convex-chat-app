import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { areFriends, avatarUrl, ensureDirectConversation, fail, getProfile, requireMember, requireProfile } from "./model";
import { geoResultSummary } from "./geoDuels";
import { wordleResultSummary } from "./wordleDuels";

const MAX_CONVERSATIONS = 100;
const MAX_GROUP_MEMBERS = 20;
const MAX_UNREAD_COUNT = 100;
const visibilityValidator = v.union(v.literal("public"), v.literal("private"));

/** Lista unica delle chat (dirette e gruppi), dalla più recente. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await getProfile(ctx);
    if (!me) return null;

    const memberships = await ctx.db
      .query("members")
      .withIndex("by_profile_and_lastMessageAt", (q) => q.eq("profileId", me._id))
      .order("desc")
      .take(MAX_CONVERSATIONS);

    const items = await Promise.all(
      memberships.map(async (membership) => {
        const conversation = await ctx.db.get("conversations", membership.conversationId);
        if (!conversation) return null;

        let title = conversation.name ?? "Gruppo";
        let avatarIndex = 0;
        let peerId = null;
        let peerLastSeenAt: number | undefined;
        let peerAvatarUrl: string | null = null;
        let peerBio: string | null = null;
        let memberCount = 0;
        let othersLastSeenAt: number[] = [];

        if (conversation.kind === "direct") {
          const pair = await ctx.db
            .query("members")
            .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
            .take(2);
          const other = pair.find((m) => m.profileId !== me._id);
          const peer = other ? await ctx.db.get("profiles", other.profileId) : null;
          if (peer) {
            title = peer.name;
            avatarIndex = peer.avatarIndex;
            peerId = peer._id;
            peerLastSeenAt = peer.lastSeenAt;
            peerAvatarUrl = await avatarUrl(ctx, peer);
            peerBio = peer.bio ?? null;
          }
        } else {
          const rows = await ctx.db
            .query("members")
            .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
            .take(MAX_GROUP_MEMBERS);
          memberCount = rows.length;
          const others = await Promise.all(
            rows.filter((m) => m.profileId !== me._id).map((m) => ctx.db.get("profiles", m.profileId)),
          );
          othersLastSeenAt = others.flatMap((p) => (p?.lastSeenAt !== undefined ? [p.lastSeenAt] : []));
        }

        // Messaggi degli altri arrivati dopo l'ultima lettura (conteggio limitato: l'interfaccia mostra "99+").
        const sinceRead = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", conversation._id).gt("_creationTime", membership.lastReadAt),
          )
          .order("desc")
          .take(MAX_UNREAD_COUNT);
        // Le righe di sistema ("📌 Stefan ha pinnato Inter") sono silenziose: non contano e non fanno notifica.
        const unreadCount = sinceRead.filter((m) => m.authorId !== me._id && m.kind !== "system").length;

        // Ultimo messaggio non letto di un altro: serve per le notifiche del sistema (titolo, testo, suono).
        // I messaggi dell'AI (riassunti) non fanno notifica: restano solo tra i non letti.
        const newest = sinceRead.find((m) => m.authorId !== me._id && m.kind !== "ai" && m.kind !== "system");
        const latest = newest
          ? {
              id: newest._id,
              authorName: newest.authorId ? ((await ctx.db.get("profiles", newest.authorId))?.name ?? "?") : null, // null = AI
              kind: newest.kind,
              style: newest.style ?? null,
              body: (newest.kind === "media" && !newest.attachments ? "" : newest.body).slice(0, 160),
              attachment: newest.attachments?.[0]?.type ?? newest.media?.type ?? null,
              /** Il messaggio di chiusura di un Wordle Duel (senza autore): la notifica mostra il risultato. */
              wordleResult: newest.wordleDuelId && !newest.authorId ? await wordleResultSummary(ctx, newest.wordleDuelId) : null,
              /** Lo stesso per il messaggio di chiusura di un Geo Duel. */
              geoResult: newest.geoDuelId && !newest.authorId ? await geoResultSummary(ctx, newest.geoDuelId) : null,
            }
          : null;

        return {
          _id: conversation._id,
          kind: conversation.kind,
          icon: conversation.icon ?? null,
          createdByMe: conversation.createdBy === me._id,
          visibility: conversation.kind === "group" ? (conversation.visibility ?? "private") : null,
          title,
          avatarIndex,
          peerId,
          peerLastSeenAt,
          peerAvatarUrl,
          peerBio,
          lastMessageAt: conversation.lastMessageAt,
          memberCount,
          othersLastSeenAt,
          unreadCount,
          latest,
        };
      }),
    );

    return items.filter((item) => item !== null);
  },
});

/** Crea un gruppo con alcuni dei miei amici (anche nessuno: una chat solo per te). */
export const createGroup = mutation({
  args: { name: v.string(), memberIds: v.array(v.id("profiles")), visibility: v.optional(visibilityValidator) },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);

    const name = args.name.trim();
    if (name.length < 1 || name.length > 60) {
      throw fail("group_name_length");
    }

    const others = [...new Set(args.memberIds)].filter((id) => id !== me._id);
    // Anche un gruppo con sola una persona (te stesso) è valido: serve come chat personale / appunti.
    if (others.length > MAX_GROUP_MEMBERS - 1) {
      throw fail("group_size");
    }
    for (const id of others) {
      if (!(await areFriends(ctx, me._id, id))) {
        throw fail("group_not_friends");
      }
    }

    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", {
      kind: "group",
      name,
      visibility: args.visibility ?? "private",
      createdBy: me._id,
      lastMessageAt: now,
    });
    for (const profileId of [me._id, ...others]) {
      await ctx.db.insert("members", { conversationId, profileId, lastReadAt: now, lastMessageAt: now });
    }
    return conversationId;
  },
});

/** Apre (o crea) la chat diretta con un amico. */
export const openDirect = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    if (!(await areFriends(ctx, me._id, args.profileId))) throw fail("not_friends");
    return await ensureDirectConversation(ctx, me._id, args.profileId);
  },
});

/** Segna la conversazione come letta. */
export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const member = await requireMember(ctx, args.conversationId, me._id);
    await ctx.db.patch("members", member._id, { lastReadAt: Date.now() });
  },
});

/** Dettagli di una conversazione: titolo e membri (per l'intestazione della chat). */
export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const mine = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId).eq("profileId", me._id))
      .unique();
    if (!mine) return null;

    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation) return null;

    const memberRows = await ctx.db
      .query("members")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(MAX_GROUP_MEMBERS);
    const profiles = await Promise.all(memberRows.map((m) => ctx.db.get("profiles", m.profileId)));
    const members = await Promise.all(
      profiles
        .filter((p) => p !== null)
        .map(async (p) => ({
          _id: p._id,
          name: p.name,
          avatarIndex: p.avatarIndex,
          avatarUrl: await avatarUrl(ctx, p),
          bio: p.bio ?? null,
          lastSeenAt: p.lastSeenAt,
        })),
    );

    const peer = members.find((m) => m._id !== me._id);
    return {
      _id: conversation._id,
      kind: conversation.kind,
      title: conversation.kind === "direct" ? (peer?.name ?? "Chat") : (conversation.name ?? "Gruppo"),
      myProfileId: me._id,
      createdByMe: conversation.createdBy === me._id,
      visibility: conversation.kind === "group" ? (conversation.visibility ?? "private") : null,
      members,
    };
  },
});

const MAX_ICON_LENGTH = 16;

/** Rinomina un gruppo e/o ne cambia l'icona (un'emoji). Può farlo qualsiasi membro. */
export const updateGroup = mutation({
  args: {
    conversationId: v.id("conversations"),
    name: v.string(),
    icon: v.union(v.string(), v.null()),
    visibility: v.optional(visibilityValidator),
  },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.kind !== "group") throw fail("not_member");
    const name = args.name.trim();
    if (name.length < 1 || name.length > 60) throw fail("group_name_length");
    const icon = args.icon?.trim();
    if (icon !== undefined && icon.length > MAX_ICON_LENGTH) throw fail("group_name_length");
    // La visibilità la cambia solo chi ha creato il gruppo.
    if (args.visibility !== undefined && args.visibility !== (conversation.visibility ?? "private") && conversation.createdBy !== me._id) {
      throw fail("not_group_owner");
    }
    await ctx.db.patch("conversations", args.conversationId, {
      name,
      icon: icon || undefined,
      ...(args.visibility !== undefined ? { visibility: args.visibility } : {}),
    });
  },
});

const PURGE_BATCH = 25;

/** Elimina un gruppo con tutto ciò che contiene. Può farlo solo chi l'ha creato. */
export const deleteGroup = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.kind !== "group") throw fail("not_member");
    if (conversation.createdBy !== me._id) throw fail("not_group_owner");

    // Il gruppo sparisce subito per tutti; messaggi e file si ripuliscono a blocchi in background.
    const members = await ctx.db
      .query("members")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(MAX_GROUP_MEMBERS + 1);
    for (const m of members) await ctx.db.delete("members", m._id);
    const typing = await ctx.db
      .query("typing")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId))
      .take(MAX_GROUP_MEMBERS + 1);
    for (const t of typing) await ctx.db.delete("typing", t._id);
    await ctx.db.delete("conversations", args.conversationId);
    await ctx.scheduler.runAfter(0, internal.conversations.purgeMessages, { conversationId: args.conversationId });
  },
});

/** Cancella i messaggi di un gruppo eliminato (reazioni e file su R2 compresi), un blocco alla volta. */
export const purgeMessages = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const batch = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(PURGE_BATCH);
    for (const message of batch) {
      const reactions = await ctx.db
        .query("reactions")
        .withIndex("by_message", (q) => q.eq("messageId", message._id))
        .take(256);
      for (const r of reactions) await ctx.db.delete("reactions", r._id);
      for (const a of message.attachments ?? (message.media ? [message.media] : [])) {
        await ctx.scheduler.runAfter(0, internal.media.deleteObject, { key: a.key });
      }
      if (reactions.length === 256) continue; // restano reazioni: il messaggio si rivede al giro dopo
      const pin = await ctx.db
        .query("pins")
        .withIndex("by_message", (q) => q.eq("messageId", message._id))
        .first();
      if (pin) await ctx.db.delete("pins", pin._id);
      await ctx.db.delete("messages", message._id);
    }
    if (batch.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.conversations.purgeMessages, { conversationId: args.conversationId });
    }
  },
});

async function groupOf(ctx: MutationCtx, conversationId: Id<"conversations">) {
  const conversation = await ctx.db.get("conversations", conversationId);
  if (!conversation || conversation.kind !== "group") throw fail("not_member");
  return conversation;
}

/** Aggiunge amici a un gruppo. Può farlo qualsiasi membro, ma solo con persone che sono sue amiche. */
export const addMembers = mutation({
  args: { conversationId: v.id("conversations"), profileIds: v.array(v.id("profiles")) },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const conversation = await groupOf(ctx, args.conversationId);

    const current = await ctx.db
      .query("members")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(MAX_GROUP_MEMBERS + 1);
    const already = new Set(current.map((m) => m.profileId));
    const toAdd = [...new Set(args.profileIds)].filter((id) => !already.has(id));
    if (current.length + toAdd.length > MAX_GROUP_MEMBERS) throw fail("group_size");
    for (const id of toAdd) {
      if (!(await areFriends(ctx, me._id, id))) throw fail("group_not_friends");
    }
    const now = Date.now();
    for (const profileId of toAdd) {
      await ctx.db.insert("members", { conversationId: args.conversationId, profileId, lastReadAt: now, lastMessageAt: conversation.lastMessageAt });
    }
  },
});

/** Toglie una persona dal gruppo. Può farlo qualsiasi membro (per uscire tu stesso c'è `leaveGroup`). */
export const removeMember = mutation({
  args: { conversationId: v.id("conversations"), profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    await groupOf(ctx, args.conversationId);
    if (args.profileId === me._id) throw fail("not_member");
    const row = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId).eq("profileId", args.profileId))
      .unique();
    if (row) await ctx.db.delete("members", row._id);
  },
});

/** Esce da un gruppo. Se non resta nessuno, il gruppo si elimina con tutto ciò che contiene. */
export const leaveGroup = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const mine = await requireMember(ctx, args.conversationId, me._id);
    await groupOf(ctx, args.conversationId);
    await ctx.db.delete("members", mine._id);
    const rest = await ctx.db
      .query("members")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(1);
    if (rest.length === 0) {
      await ctx.db.delete("conversations", args.conversationId);
      await ctx.scheduler.runAfter(0, internal.conversations.purgeMessages, { conversationId: args.conversationId });
    }
  },
});

const MAX_PUBLIC_LISTED = 50;

/** Gruppi pubblici a cui non partecipo ancora (elenco "Esplora"). */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const groups = await ctx.db
      .query("conversations")
      .withIndex("by_visibility", (q) => q.eq("visibility", "public"))
      .take(MAX_PUBLIC_LISTED);
    const out = await Promise.all(
      groups
        .filter((g) => g.kind === "group")
        .map(async (g) => {
          const members = await ctx.db
            .query("members")
            .withIndex("by_conversation", (q) => q.eq("conversationId", g._id))
            .take(MAX_GROUP_MEMBERS + 1);
          if (members.some((m) => m.profileId === me._id)) return null;
          return { _id: g._id, name: g.name ?? "Gruppo", icon: g.icon ?? null, memberCount: members.length, full: members.length >= MAX_GROUP_MEMBERS };
        }),
    );
    return out.filter((g) => g !== null);
  },
});

/** Entra in un gruppo pubblico. */
export const joinGroup = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const conversation = await groupOf(ctx, args.conversationId);
    if (conversation.visibility !== "public") throw fail("group_not_public");
    const members = await ctx.db
      .query("members")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(MAX_GROUP_MEMBERS + 1);
    if (members.some((m) => m.profileId === me._id)) return;
    if (members.length >= MAX_GROUP_MEMBERS) throw fail("group_size");
    const now = Date.now();
    await ctx.db.insert("members", { conversationId: args.conversationId, profileId: me._id, lastReadAt: now, lastMessageAt: conversation.lastMessageAt });
  },
});

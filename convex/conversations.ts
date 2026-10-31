import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { areFriends, avatarUrl, ensureDirectConversation, fail, getProfile, requireMember, requireProfile } from "./model";

const MAX_CONVERSATIONS = 100;
const MAX_GROUP_MEMBERS = 20;
const MAX_UNREAD_COUNT = 100;

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
        const unreadCount = sinceRead.filter((m) => m.authorId !== me._id).length;

        return {
          _id: conversation._id,
          kind: conversation.kind,
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
        };
      }),
    );

    return items.filter((item) => item !== null);
  },
});

/** Crea un gruppo con alcuni dei miei amici (anche nessuno: una chat solo per te). */
export const createGroup = mutation({
  args: { name: v.string(), memberIds: v.array(v.id("profiles")) },
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
      members,
    };
  },
});

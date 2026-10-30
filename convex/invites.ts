import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureDirectConversation, fail, getProfile, pairKey, requireProfile } from "./model";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni

/** Crea un link d'invito monouso. Il client costruisce l'URL a partire dal token. */
export const create = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireProfile(ctx);
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    await ctx.db.insert("invites", {
      token,
      createdBy: me._id,
      expiresAt: Date.now() + INVITE_TTL_MS,
    });
    return token;
  },
});

/** Il mio ultimo invito ancora valido (così il link si vede subito senza crearne uno nuovo a ogni apertura). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const latest = await ctx.db
      .query("invites")
      .withIndex("by_createdBy", (q) => q.eq("createdBy", me._id))
      .order("desc")
      .first();
    if (!latest || latest.redeemedBy || latest.expiresAt < Date.now()) return null;
    return latest.token;
  },
});

/** Anteprima di un invito prima di accettarlo: chi ti ha invitato e se è ancora valido. */
export const preview = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!invite) return { valid: false as const, reason: "not_found" as const };
    if (invite.redeemedBy) return { valid: false as const, reason: "used" as const };
    if (invite.expiresAt < Date.now()) return { valid: false as const, reason: "expired" as const };
    const inviter = await ctx.db.get("profiles", invite.createdBy);
    if (!inviter) return { valid: false as const, reason: "not_found" as const };
    return { valid: true as const, inviterName: inviter.name, isOwn: inviter._id === me._id };
  },
});

/** Usa un invito: crea una richiesta d'amicizia verso chi ha generato il link. */
export const redeem = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!invite || invite.redeemedBy || invite.expiresAt < Date.now()) {
      throw fail("invalid_invite");
    }
    if (invite.createdBy === me._id) {
      throw fail("own_invite");
    }

    const key = pairKey(me._id, invite.createdBy);
    const existing = await ctx.db
      .query("friendships")
      .withIndex("by_pairKey", (q) => q.eq("pairKey", key))
      .unique();

    if (existing?.status === "accepted") return "already_friends" as const;

    if (existing) {
      // L'altra persona aveva già chiesto l'amicizia a me: il link la conferma.
      if (existing.addressee === me._id) {
        await ctx.db.patch("friendships", existing._id, { status: "accepted" });
        await ensureDirectConversation(ctx, me._id, invite.createdBy);
        await ctx.db.patch("invites", invite._id, { redeemedBy: me._id });
        return "accepted" as const;
      }
      return "already_requested" as const;
    }

    await ctx.db.insert("friendships", {
      requester: me._id,
      addressee: invite.createdBy,
      status: "pending",
      pairKey: key,
    });
    await ctx.db.patch("invites", invite._id, { redeemedBy: me._id });
    return "requested" as const;
  },
});

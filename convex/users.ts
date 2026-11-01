import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { avatarUrl, fail, getProfile, pairKey, requireProfile } from "./model";

const AVATAR_COUNT = 3; // avatar nella palette dei temi (presets.json)

/**
 * Crea il profilo dell'app la prima volta che un utente autenticato apre l'app.
 * È idempotente: il client può chiamarla a ogni avvio.
 */
export const ensureProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw fail("not_authenticated");

    const existing = await getProfile(ctx);
    if (existing) return existing._id;

    const user = await authComponent.getAuthUser(ctx);
    return await ctx.db.insert("profiles", {
      tokenIdentifier: identity.tokenIdentifier,
      name: user.name,
      email: user.email,
      avatarIndex: Math.floor(Math.random() * AVATAR_COUNT),
    });
  },
});

/** Segnala che sono attivo (aggiorna "ultimo accesso"). Limitata per non riscrivere a ogni chiamata. */
export const heartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await getProfile(ctx);
    if (!me) return;
    const now = Date.now();
    if (me.lastSeenAt !== undefined && now - me.lastSeenAt < 30_000) return;
    await ctx.db.patch("profiles", me._id, { lastSeenAt: now });
  },
});

/** Il mio profilo (null se non sono autenticato o il profilo non è ancora stato creato). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const profile = await getProfile(ctx);
    if (!profile) return null;
    return {
      _id: profile._id,
      name: profile.name,
      email: profile.email,
      avatarIndex: profile.avatarIndex,
      avatarUrl: await avatarUrl(ctx, profile),
      bio: profile.bio ?? "",
    };
  },
});

/** Profilo pubblico di una persona (mai l'email): per la scheda aperta cliccando su un nome o un avatar. */
export const profile = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const p = await ctx.db.get("profiles", args.profileId);
    if (!p) return null;
    return {
      _id: p._id,
      name: p.name,
      bio: p.bio ?? "",
      avatarIndex: p.avatarIndex,
      avatarUrl: await avatarUrl(ctx, p),
      lastSeenAt: p.lastSeenAt,
      joinedAt: p._creationTime,
      isMe: p._id === me._id,
    };
  },
});

const MAX_SEARCH_SCAN = 500;
const MAX_SEARCH_RESULTS = 20;

/**
 * Cerca persone iscritte per nome (senza distinguere maiuscole) o per email esatta. Senza testo elenca le prime.
 * Restituisce solo nome e avatar, mai l'email, più il rapporto con me per scegliere il pulsante giusto.
 */
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return [];

    const needle = args.query.trim().toLocaleLowerCase().slice(0, 60);
    const profiles = await ctx.db.query("profiles").take(MAX_SEARCH_SCAN);
    const matches = profiles
      // Il nome si cerca anche in parte; l'email solo se scritta per intero, così non si possono indovinare gli indirizzi altrui.
      .filter(
        (p) =>
          p._id !== me._id &&
          (needle === "" || p.name.toLocaleLowerCase().includes(needle) || p.email.toLocaleLowerCase() === needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_SEARCH_RESULTS);

    return await Promise.all(
      matches.map(async (p) => {
        const friendship = await ctx.db
          .query("friendships")
          .withIndex("by_pairKey", (q) => q.eq("pairKey", pairKey(me._id, p._id)))
          .unique();
        const relation =
          friendship === null
            ? ("none" as const)
            : friendship.status === "accepted"
              ? ("friend" as const)
              : friendship.requester === me._id
                ? ("outgoing" as const)
                : ("incoming" as const);
        return {
          _id: p._id,
          name: p.name,
          avatarIndex: p.avatarIndex,
          avatarUrl: await avatarUrl(ctx, p),
          bio: p.bio ?? null,
          relation,
        };
      }),
    );
  },
});

const MAX_NAME = 40;
const MAX_BIO = 200;
const MAX_AVATAR_BYTES = 1024 * 1024;

/** Modifica nome e descrizione del mio profilo. */
export const updateProfile = mutation({
  args: { name: v.string(), bio: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const name = args.name.trim();
    const bio = args.bio.trim();
    if (name.length < 1 || name.length > MAX_NAME) throw fail("invalid_name");
    if (bio.length > MAX_BIO) throw fail("bio_too_long");
    await ctx.db.patch("profiles", me._id, { name, bio: bio === "" ? undefined : bio });
  },
});

/** Indirizzo temporaneo su cui il client carica la nuova foto profilo. */
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Imposta come foto profilo un file appena caricato (solo immagini, max 1 MB). */
export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file || file.size > MAX_AVATAR_BYTES || !file.contentType?.startsWith("image/")) {
      if (file) await ctx.storage.delete(args.storageId);
      throw fail("invalid_image");
    }
    if (me.avatarStorageId) await ctx.storage.delete(me.avatarStorageId);
    await ctx.db.patch("profiles", me._id, { avatarStorageId: args.storageId });
  },
});

/** Torna all'iniziale colorata. */
export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireProfile(ctx);
    if (me.avatarStorageId) {
      await ctx.storage.delete(me.avatarStorageId);
      await ctx.db.patch("profiles", me._id, { avatarStorageId: undefined });
    }
  },
});

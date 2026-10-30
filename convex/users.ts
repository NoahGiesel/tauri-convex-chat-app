import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { fail, getProfile } from "./model";

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

/** Il mio profilo (null se non sono autenticato o il profilo non è ancora stato creato). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const profile = await getProfile(ctx);
    if (!profile) return null;
    return { _id: profile._id, name: profile.name, email: profile.email, avatarIndex: profile.avatarIndex };
  },
});

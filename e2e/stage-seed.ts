// Copied into the stage's convex/ as e2eSeed.ts. It never lives in the repo's convex/, because `npx convex deploy` works from there.
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";

/** By email, because IDs and tokens differ between runs. A Seed holds three profiles, so a scan is enough. */
async function profileByEmail(ctx: MutationCtx, email: string) {
  for await (const profile of ctx.db.query("profiles")) {
    if (profile.email === email) return profile;
  }
  throw new Error(`no profile for ${email}`);
}

/** Public functions cannot make the random avatar index deterministic. */
export const fixAvatars = internalMutation({
  args: {},
  handler: async (ctx) => {
    // By email, because IDs and tokens differ between runs.
    const profiles = await ctx.db.query("profiles").withIndex("by_tokenIdentifier").collect();
    profiles.sort((a, b) => a.email.localeCompare(b.email));
    for (const [i, profile] of profiles.entries()) {
      await ctx.db.patch("profiles", profile._id, { avatarIndex: i % 3 });
    }
  },
});

/** Public functions only make invites that are valid for 7 days. */
export const expiredInvite = internalMutation({
  args: { token: v.string(), createdByEmail: v.string() },
  handler: async (ctx, args) => {
    const profile = await profileByEmail(ctx, args.createdByEmail);
    await ctx.db.insert("invites", { token: args.token, createdBy: profile._id, expiresAt: Date.now() - 60 * 60 * 1000 });
  },
});

/**
 * The public way to look away, `setInvisible`, also makes the user invisible, and an invisible user's
 * heartbeat does nothing. A Scripted user could then never come online again.
 */
export const setLastSeenAt = internalMutation({
  args: { email: v.string(), lastSeenAt: v.number() },
  handler: async (ctx, args) => {
    const profile = await profileByEmail(ctx, args.email);
    await ctx.db.patch("profiles", profile._id, { lastSeenAt: args.lastSeenAt });
  },
});

/**
 * The server picks a Wordle Duel's word at random, so a test sets the open Duel's word after acceptance to one it knows.
 * A scan, because a test plays one Duel on a fresh Seed, and no index has the status alone.
 */
export const setWordleWord = internalMutation({
  args: { word: v.string() },
  handler: async (ctx, args) => {
    const open = [];
    for await (const duel of ctx.db.query("wordleDuels")) {
      if (duel.status === "open") open.push(duel);
    }
    if (open.length !== 1) throw new Error(`expected one open Wordle Duel, found ${open.length}`);
    await ctx.db.patch("wordleDuels", open[0]._id, { word: args.word });
  },
});

// Copied into the stage's convex/ as e2eSeed.ts. It never lives in the repo's convex/, because `npx convex deploy` works from there.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/** The one thing public functions cannot do here: make the random avatar index deterministic. */
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
    for await (const profile of ctx.db.query("profiles")) {
      if (profile.email !== args.createdByEmail) continue;
      await ctx.db.insert("invites", { token: args.token, createdBy: profile._id, expiresAt: Date.now() - 60 * 60 * 1000 });
      return;
    }
    throw new Error(`no profile for ${args.createdByEmail}`);
  },
});

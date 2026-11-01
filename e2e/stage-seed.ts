// Copied into the stage's convex/ as e2eSeed.ts. It never lives in the repo's convex/, because `npx convex deploy` works from there.
import { internalMutation } from "./_generated/server";

/** The one thing public functions cannot do here: make the random avatar index deterministic. */
export const fixAvatars = internalMutation({
  args: {},
  handler: async (ctx) => {
    let i = 0;
    for await (const profile of ctx.db.query("profiles").withIndex("by_tokenIdentifier")) {
      await ctx.db.patch("profiles", profile._id, { avatarIndex: i++ % 3 });
    }
  },
});

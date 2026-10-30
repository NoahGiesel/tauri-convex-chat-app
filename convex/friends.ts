import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { ensureDirectConversation, fail, getProfile, publicProfile, requireProfile } from "./model";

const MAX = 200;

/** Amici accettati + richieste in entrata e in uscita. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await getProfile(ctx);
    if (!me) return null;

    const [sentAccepted, receivedAccepted, incoming, outgoing] = await Promise.all([
      ctx.db
        .query("friendships")
        .withIndex("by_requester_and_status", (q) => q.eq("requester", me._id).eq("status", "accepted"))
        .take(MAX),
      ctx.db
        .query("friendships")
        .withIndex("by_addressee_and_status", (q) => q.eq("addressee", me._id).eq("status", "accepted"))
        .take(MAX),
      ctx.db
        .query("friendships")
        .withIndex("by_addressee_and_status", (q) => q.eq("addressee", me._id).eq("status", "pending"))
        .take(MAX),
      ctx.db
        .query("friendships")
        .withIndex("by_requester_and_status", (q) => q.eq("requester", me._id).eq("status", "pending"))
        .take(MAX),
    ]);

    const resolve = async (f: Doc<"friendships">, otherId: Id<"profiles">) => {
      const other = await ctx.db.get("profiles", otherId);
      return other ? { friendshipId: f._id, profile: publicProfile(other) } : null;
    };

    const nonNull = <T,>(x: T | null): x is T => x !== null;
    const [friendsA, friendsB, requestsIn, requestsOut] = await Promise.all([
      Promise.all(sentAccepted.map((f) => resolve(f, f.addressee))),
      Promise.all(receivedAccepted.map((f) => resolve(f, f.requester))),
      Promise.all(incoming.map((f) => resolve(f, f.requester))),
      Promise.all(outgoing.map((f) => resolve(f, f.addressee))),
    ]);

    return {
      friends: [...friendsA, ...friendsB].filter(nonNull),
      incoming: requestsIn.filter(nonNull),
      outgoing: requestsOut.filter(nonNull),
    };
  },
});

/** Accetta una richiesta ricevuta e apre la chat diretta. */
export const accept = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const friendship = await ctx.db.get("friendships", args.friendshipId);
    if (!friendship || friendship.addressee !== me._id || friendship.status !== "pending") {
      throw fail("request_not_found");
    }
    await ctx.db.patch("friendships", friendship._id, { status: "accepted" });
    return await ensureDirectConversation(ctx, me._id, friendship.requester);
  },
});

/** Rifiuta una richiesta, annulla una richiesta inviata o rimuove un amico. */
export const remove = mutation({
  args: { friendshipId: v.id("friendships") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const friendship = await ctx.db.get("friendships", args.friendshipId);
    if (!friendship || (friendship.requester !== me._id && friendship.addressee !== me._id)) {
      throw fail("friendship_not_found");
    }
    await ctx.db.delete("friendships", friendship._id);
  },
});

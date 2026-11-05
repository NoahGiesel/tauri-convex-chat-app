import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, getProfile, requireMember, requireProfile } from "./model";
import { wordleLanguage, wordleRunMinutes } from "./schema";
import { INVITE_TTL_MS } from "./wordleRules";
import { pickSolution } from "./wordleWords";

/** Parole dei Duel passati lette per non ripeterle: più di quante soluzioni ha una lista. */
const USED_WORDS_LIMIT = 3000;

/** Il Wordle Duel ancora in corso nella chat (invito in attesa o Duel aperto), se c'è. Non legge mai `games` né `quizzes`. */
async function activeDuel(ctx: QueryCtx, conversationId: Id<"conversations">): Promise<Doc<"wordleDuels"> | null> {
  for (const status of ["invite", "open"] as const) {
    const duel = await ctx.db
      .query("wordleDuels")
      .withIndex("by_conversation_and_status", (q) => q.eq("conversationId", conversationId).eq("status", status))
      .first();
    if (duel) return duel;
  }
  return null;
}

async function membersOf(ctx: QueryCtx, conversationId: Id<"conversations">) {
  return await ctx.db
    .query("members")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .take(5);
}

/** Aggiunge alla chat un messaggio del Duel e la fa salire nell'elenco; per chi scrive il messaggio è già letto. */
async function postDuelMessage(ctx: MutationCtx, members: Doc<"members">[], message: Omit<Doc<"messages">, "_id" | "_creationTime">) {
  const now = Date.now();
  await ctx.db.insert("messages", message);
  await ctx.db.patch("conversations", message.conversationId, { lastMessageAt: now });
  for (const m of members) {
    await ctx.db.patch("members", m._id, m.profileId === message.authorId ? { lastMessageAt: now, lastReadAt: now } : { lastMessageAt: now });
  }
}

/** `/wordle`: sfida l'altra persona di una chat diretta a un Wordle Duel. La parola la sceglie il server. */
export const start = mutation({
  args: { conversationId: v.id("conversations"), runMinutes: wordleRunMinutes, language: wordleLanguage },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.kind !== "direct") throw fail("game_direct_only");
    const members = await membersOf(ctx, args.conversationId);
    const peer = members.find((m) => m.profileId !== me._id);
    if (!peer) throw fail("game_direct_only");
    if (await activeDuel(ctx, args.conversationId)) throw fail("wordle_in_progress");

    // Niente parole già giocate in questa chat e lingua (Duel accettati), finché ce ne sono di nuove.
    const past = await ctx.db
      .query("wordleDuels")
      .withIndex("by_conversation_and_language", (q) => q.eq("conversationId", args.conversationId).eq("language", args.language))
      .order("desc")
      .take(USED_WORDS_LIMIT);
    const word = pickSolution(args.language, new Set(past.flatMap((d) => (d.acceptedAt !== undefined ? [d.word] : []))));

    const createdAt = Date.now();
    const duelId = await ctx.db.insert("wordleDuels", {
      conversationId: args.conversationId,
      playerA: me._id,
      playerB: peer.profileId,
      runMinutes: args.runMinutes,
      language: args.language,
      word,
      status: "invite",
      createdAt,
    });
    await postDuelMessage(ctx, members, { conversationId: args.conversationId, authorId: me._id, kind: "game", body: "wordle", wordleDuelId: duelId });
    await ctx.scheduler.runAt(createdAt + INVITE_TTL_MS, internal.wordleDuels.expireInvite, { duelId });
    return duelId;
  },
});

/** Lo sfidato accetta o rifiuta; chi ha sfidato può ritirare l'invito finché non è accettato. */
export const respond = mutation({
  args: { duelId: v.id("wordleDuels"), action: v.union(v.literal("accept"), v.literal("decline"), v.literal("withdraw")) },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const duel = await ctx.db.get("wordleDuels", args.duelId);
    if (!duel) throw fail("game_closed");
    await requireMember(ctx, duel.conversationId, me._id);
    if (duel.status !== "invite") throw fail("game_closed");

    const now = Date.now();
    if (args.action === "withdraw") {
      if (duel.playerA !== me._id) throw fail("not_member");
      await ctx.db.patch("wordleDuels", duel._id, { status: "withdrawn", finishedAt: now });
      return;
    }
    if (duel.playerB !== me._id) throw fail("not_member");
    if (args.action === "decline") {
      await ctx.db.patch("wordleDuels", duel._id, { status: "declined", finishedAt: now });
      return;
    }
    await ctx.db.patch("wordleDuels", duel._id, { status: "open", acceptedAt: now });
  },
});

/** Un invito rimasto senza risposta per 24 ore scade, senza messaggi in chat. */
export const expireInvite = internalMutation({
  args: { duelId: v.id("wordleDuels") },
  handler: async (ctx, args) => {
    const duel = await ctx.db.get("wordleDuels", args.duelId);
    if (!duel || duel.status !== "invite") return;
    await ctx.db.patch("wordleDuels", duel._id, { status: "expired", finishedAt: Date.now() });
  },
});

/** La scheda del Duel per chi è nella chat. Finché il Duel non è chiuso non contiene mai la parola. */
export const get = query({
  args: { duelId: v.id("wordleDuels") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const duel = await ctx.db.get("wordleDuels", args.duelId);
    if (!duel) return null;
    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", duel.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return null;

    const [a, b] = await Promise.all([ctx.db.get("profiles", duel.playerA), ctx.db.get("profiles", duel.playerB)]);
    return {
      _id: duel._id,
      conversationId: duel.conversationId,
      status: duel.status,
      mySide: duel.playerA === me._id ? ("a" as const) : duel.playerB === me._id ? ("b" as const) : null,
      nameA: a?.name ?? "?",
      nameB: b?.name ?? "?",
      runMinutes: duel.runMinutes,
      language: duel.language,
      createdAt: duel.createdAt,
      expiresAt: duel.createdAt + INVITE_TTL_MS,
      acceptedAt: duel.acceptedAt ?? null,
    };
  },
});

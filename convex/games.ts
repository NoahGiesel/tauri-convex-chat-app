import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { COUNTDOWN_MS, GRACE_MS, REVEAL_MS, isOver, roundWinner } from "./gameRules";
import { fail, getProfile, requireMember, requireProfile } from "./model";

const move = v.union(v.literal("stone"), v.literal("paper"), v.literal("scissors"));
const HISTORY_LIMIT = 50;
/** Stati in cui un quiz occupa ancora la chat (non se ne può iniziare un altro gioco). */
export const ACTIVE_QUIZ = new Set<string>(["setup", "invite", "generating", "playing"]);
const STATS_LIMIT = 500;

/** Mette in programma la chiusura del round che sta per scadere. */
async function scheduleResolve(ctx: MutationCtx, gameId: Id<"games">, round: number, endsAt: number) {
  await ctx.scheduler.runAt(endsAt + GRACE_MS + 100, internal.games.resolveRound, { gameId, round });
}

/** `/stone-paper-scissors`: sfida l'altra persona di una chat diretta. */
export const start = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.kind !== "direct") throw fail("game_direct_only");

    const members = await ctx.db
      .query("members")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(5);
    const peer = members.find((m) => m.profileId !== me._id);
    if (!peer) throw fail("game_direct_only");

    const recent = await ctx.db
      .query("games")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(5);
    if (recent.some((g) => g.status === "invite" || g.status === "playing")) throw fail("game_in_progress");
    const recentQuizzes = await ctx.db
      .query("quizzes")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(5);
    if (recentQuizzes.some((z) => ACTIVE_QUIZ.has(z.status))) throw fail("game_in_progress");

    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      conversationId: args.conversationId,
      playerA: me._id,
      playerB: peer.profileId,
      status: "invite",
      scoreA: 0,
      scoreB: 0,
      rounds: [],
    });
    await ctx.db.insert("messages", { conversationId: args.conversationId, authorId: me._id, kind: "game", body: "rps", gameId });
    await ctx.db.patch("conversations", args.conversationId, { lastMessageAt: now });
    for (const m of members) {
      await ctx.db.patch("members", m._id, m.profileId === me._id ? { lastMessageAt: now, lastReadAt: now } : { lastMessageAt: now });
    }
    return gameId;
  },
});

/** Lo sfidato accetta o rifiuta; chi ha sfidato può ritirare la sfida finché non è stata accettata. */
export const respond = mutation({
  args: { gameId: v.id("games"), action: v.union(v.literal("accept"), v.literal("decline"), v.literal("cancel")) },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const game = await ctx.db.get("games", args.gameId);
    if (!game) throw fail("game_closed");
    await requireMember(ctx, game.conversationId, me._id);
    if (game.status !== "invite") throw fail("game_closed");

    if (args.action === "cancel") {
      if (game.playerA !== me._id) throw fail("not_member");
      await ctx.db.patch("games", game._id, { status: "cancelled", finishedAt: Date.now() });
      return;
    }
    if (game.playerB !== me._id) throw fail("not_member");
    if (args.action === "decline") {
      await ctx.db.patch("games", game._id, { status: "declined", finishedAt: Date.now() });
      return;
    }
    const endsAt = Date.now() + COUNTDOWN_MS;
    await ctx.db.patch("games", game._id, { status: "playing", endsAt });
    await scheduleResolve(ctx, game._id, 0, endsAt);
  },
});

/** Sceglie la mossa del round in corso; si può cambiare finché dura il conto alla rovescia. */
export const pick = mutation({
  args: { gameId: v.id("games"), move },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const game = await ctx.db.get("games", args.gameId);
    if (!game) throw fail("game_closed");
    const side = game.playerA === me._id ? "a" : game.playerB === me._id ? "b" : null;
    if (!side) throw fail("not_member");
    if (game.status !== "playing" || game.endsAt === undefined || Date.now() > game.endsAt + GRACE_MS) throw fail("game_closed");
    await ctx.db.patch("games", game._id, side === "a" ? { pickA: args.move } : { pickB: args.move });
  },
});

/** Chiude il round: rivela le mosse, assegna il punto e decide se la partita continua. */
export const resolveRound = internalMutation({
  args: { gameId: v.id("games"), round: v.number() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (!game || game.status !== "playing" || game.rounds.length !== args.round || game.endsAt === undefined) return; // già chiuso
    const winner = roundWinner(game.pickA, game.pickB);
    const rounds = [...game.rounds, { a: game.pickA, b: game.pickB, winner }];
    const scoreA = game.scoreA + (winner === "a" ? 1 : 0);
    const scoreB = game.scoreB + (winner === "b" ? 1 : 0);
    const base = { rounds, scoreA, scoreB, pickA: undefined, pickB: undefined, endsAt: undefined };

    if (isOver(scoreA, scoreB, rounds.length)) {
      await ctx.db.patch("games", game._id, {
        ...base,
        status: "done",
        nextRoundAt: undefined,
        winnerId: scoreA === scoreB ? undefined : scoreA > scoreB ? game.playerA : game.playerB,
        finishedAt: Date.now(),
      });
      return;
    }
    const nextRoundAt = Date.now() + REVEAL_MS;
    await ctx.db.patch("games", game._id, { ...base, nextRoundAt });
    await ctx.scheduler.runAt(nextRoundAt, internal.games.beginRound, { gameId: game._id, round: rounds.length });
  },
});

/** Fa partire il conto alla rovescia del round successivo. */
export const beginRound = internalMutation({
  args: { gameId: v.id("games"), round: v.number() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get("games", args.gameId);
    if (!game || game.status !== "playing" || game.rounds.length !== args.round) return;
    const endsAt = Date.now() + COUNTDOWN_MS;
    await ctx.db.patch("games", game._id, { endsAt, nextRoundAt: undefined });
    await scheduleResolve(ctx, game._id, args.round, endsAt);
  },
});

/** Stato di una partita per chi la guarda. La mossa dell'avversario resta nascosta finché il round non si chiude. */
export const get = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const game = await ctx.db.get("games", args.gameId);
    if (!game) return null;
    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", game.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return null;

    const [a, b] = await Promise.all([ctx.db.get("profiles", game.playerA), ctx.db.get("profiles", game.playerB)]);
    const mySide = game.playerA === me._id ? "a" : game.playerB === me._id ? "b" : null;
    return {
      _id: game._id,
      conversationId: game.conversationId,
      status: game.status,
      mySide,
      nameA: a?.name ?? "?",
      nameB: b?.name ?? "?",
      scoreA: game.scoreA,
      scoreB: game.scoreB,
      rounds: game.rounds,
      endsAt: game.endsAt ?? null,
      nextRoundAt: game.nextRoundAt ?? null,
      myPick: mySide === "a" ? (game.pickA ?? null) : mySide === "b" ? (game.pickB ?? null) : null,
      opponentPicked: mySide === "a" ? game.pickB !== undefined : mySide === "b" ? game.pickA !== undefined : false,
      winnerSide: game.winnerId ? (game.winnerId === game.playerA ? ("a" as const) : ("b" as const)) : null,
      serverNow: Date.now(),
    };
  },
});

/** Partite finite di una chat e statistiche (per la scheda "Giochi" di Media). */
export const history = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", args.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return null;

    const games = await ctx.db
      .query("games")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(STATS_LIMIT);
    const done = games.filter((g) => g.status === "done");

    const names = new Map<Id<"profiles">, string>();
    const nameOf = async (id: Id<"profiles">) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get("profiles", id))?.name ?? "?");
      return names.get(id)!;
    };

    const players = new Map<Id<"profiles">, { profileId: Id<"profiles">; name: string; wins: number; roundWins: number }>();
    const entry = async (id: Id<"profiles">) => {
      if (!players.has(id)) players.set(id, { profileId: id, name: await nameOf(id), wins: 0, roundWins: 0 });
      return players.get(id)!;
    };
    let draws = 0;
    for (const g of done) {
      (await entry(g.playerA)).roundWins += g.scoreA;
      (await entry(g.playerB)).roundWins += g.scoreB;
      if (g.winnerId) (await entry(g.winnerId)).wins += 1;
      else draws += 1;
    }

    const recent = await Promise.all(
      done.slice(0, HISTORY_LIMIT).map(async (g) => ({
        _id: g._id,
        finishedAt: g.finishedAt ?? g._creationTime,
        nameA: await nameOf(g.playerA),
        nameB: await nameOf(g.playerB),
        scoreA: g.scoreA,
        scoreB: g.scoreB,
        winnerSide: g.winnerId ? (g.winnerId === g.playerA ? ("a" as const) : ("b" as const)) : null,
        iWon: g.winnerId === me._id,
      })),
    );
    return { total: done.length, draws, players: [...players.values()], myProfileId: me._id, recent };
  },
});

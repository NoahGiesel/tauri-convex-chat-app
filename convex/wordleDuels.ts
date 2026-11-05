import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, getProfile, requireMember, requireProfile } from "./model";
import { wordleLanguage, wordleRunMinutes } from "./schema";
import { DUEL_TTL_MS, GRACE_MS, INVITE_TTL_MS, MAX_GUESSES, WORD_LENGTH, foldGuess, scoreGuess } from "./wordleRules";
import { isGuess, pickSolution } from "./wordleWords";

/** Parole dei Duel passati lette per non ripeterle: più di quante soluzioni ha una lista. */
const USED_WORDS_LIMIT = 3000;

type Side = "a" | "b";
type Run = NonNullable<Doc<"wordleDuels">["runA"]>;
type EndReason = NonNullable<Run["endReason"]>;
/** Il campo della Run di ciascun giocatore: A è chi ha sfidato. */
const RUN_FIELD = { a: "runA", b: "runB" } as const;

function sideOf(duel: Doc<"wordleDuels">, profileId: Id<"profiles">): Side | null {
  return duel.playerA === profileId ? "a" : duel.playerB === profileId ? "b" : null;
}

/** Stato di una Run come lo vede la scheda: da giocare, in corso o finita. */
function runState(run: Run | undefined): "toPlay" | "playing" | "finished" {
  return !run ? "toPlay" : run.endReason ? "finished" : "playing";
}

/** Il Duel e il lato di chi chiama, che deve essere uno dei due giocatori. */
async function requirePlayer(ctx: QueryCtx, duelId: Id<"wordleDuels">) {
  const me = await requireProfile(ctx);
  const duel = await ctx.db.get("wordleDuels", duelId);
  if (!duel) throw fail("game_closed");
  const side = sideOf(duel, me._id);
  if (!side) throw fail("not_member");
  return { duel, side };
}

/** La Run in corso di chi chiama; respinge se è finita, mai aperta o fuori tempo (oltre la tolleranza). */
function requireRunningRun(duel: Doc<"wordleDuels">, side: Side, now: number): Run {
  const run = duel[RUN_FIELD[side]];
  if (duel.status !== "open" || !run || run.endReason || now > run.endsAt + GRACE_MS) throw fail("wordle_run_over");
  return run;
}

const runPatch = (side: Side, run: Run) => (side === "a" ? { runA: run } : { runB: run });

/** Chiude la Run. Il tempo della Run non supera mai il Run timer, anche per un tentativo arrivato nella tolleranza. */
async function endRun(ctx: MutationCtx, duel: Doc<"wordleDuels">, side: Side, run: Run, reason: EndReason, now: number) {
  await ctx.db.patch("wordleDuels", duel._id, runPatch(side, { ...run, endReason: reason, endedAt: Math.min(now, run.endsAt) }));
}

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

    const side = sideOf(duel, me._id);
    const [a, b] = await Promise.all([ctx.db.get("profiles", duel.playerA), ctx.db.get("profiles", duel.playerB)]);
    return {
      _id: duel._id,
      conversationId: duel.conversationId,
      status: duel.status,
      mySide: side,
      nameA: a?.name ?? "?",
      nameB: b?.name ?? "?",
      runMinutes: duel.runMinutes,
      language: duel.language,
      createdAt: duel.createdAt,
      expiresAt: duel.createdAt + INVITE_TTL_MS,
      acceptedAt: duel.acceptedAt ?? null,
      deadline: duel.acceptedAt !== undefined ? duel.acceptedAt + DUEL_TTL_MS : null,
      /** Solo lo stato e la fine del Run timer di chi guarda: mai i suoi tentativi qui. */
      myRun: side ? { state: runState(duel[RUN_FIELD[side]]), endsAt: duel[RUN_FIELD[side]]?.endsAt ?? null } : null,
    };
  },
});

/** Apre la Run di chi chiama (se non è già aperta): da qui parte il Run timer, che non si ferma mai. */
export const openRun = mutation({
  args: { duelId: v.id("wordleDuels") },
  handler: async (ctx, args) => {
    const { duel, side } = await requirePlayer(ctx, args.duelId);
    const now = Date.now();
    // La Run si può aprire fino alla Duel deadline.
    if (duel.status !== "open" || duel.acceptedAt === undefined || now >= duel.acceptedAt + DUEL_TTL_MS) throw fail("game_closed");
    if (duel[RUN_FIELD[side]]) return;
    const endsAt = now + duel.runMinutes * 60_000;
    await ctx.db.patch("wordleDuels", duel._id, runPatch(side, { startedAt: now, endsAt, guesses: [] }));
    await ctx.scheduler.runAt(endsAt + GRACE_MS, internal.wordleDuels.timeoutRun, { duelId: duel._id, side });
  },
});

/** Un tentativo: controllato sul server, in minuscolo. Una parola che non è nella lista non si salva e non conta. */
export const guess = mutation({
  args: { duelId: v.id("wordleDuels"), word: v.string() },
  handler: async (ctx, args) => {
    const { duel, side } = await requirePlayer(ctx, args.duelId);
    const now = Date.now();
    const run = requireRunningRun(duel, side, now);
    const word = foldGuess(args.word);
    if (word.length < WORD_LENGTH) throw fail("wordle_short");
    if (!isGuess(duel.language, word)) throw fail("wordle_not_a_word");

    const next = { ...run, guesses: [...run.guesses, word] };
    if (word === duel.word) await endRun(ctx, duel, side, next, "solved", now);
    else if (next.guesses.length >= MAX_GUESSES) await endRun(ctx, duel, side, next, "missed", now);
    else await ctx.db.patch("wordleDuels", duel._id, runPatch(side, next));
  },
});

/** Arrendersi: la Run finisce subito e conta come parola non indovinata. */
export const giveUp = mutation({
  args: { duelId: v.id("wordleDuels") },
  handler: async (ctx, args) => {
    const { duel, side } = await requirePlayer(ctx, args.duelId);
    const now = Date.now();
    await endRun(ctx, duel, side, requireRunningRun(duel, side, now), "gaveUp", now);
  },
});

/** Allo scadere del Run timer (più la tolleranza) chiude con `timeout` la Run ancora in corso. */
export const timeoutRun = internalMutation({
  args: { duelId: v.id("wordleDuels"), side: v.union(v.literal("a"), v.literal("b")) },
  handler: async (ctx, args) => {
    const duel = await ctx.db.get("wordleDuels", args.duelId);
    const run = duel?.[RUN_FIELD[args.side]];
    if (!duel || duel.status !== "open" || !run || run.endReason) return;
    await endRun(ctx, duel, args.side, run, "timeout", run.endsAt);
  },
});

/**
 * La Run di chi chiede, per la finestra della Run: solo i suoi tentativi con i colori, la fine del Run timer
 * e l'ora del server. Mai la parola né i tentativi dell'altro.
 */
export const myRun = query({
  args: { duelId: v.id("wordleDuels") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const duel = await ctx.db.get("wordleDuels", args.duelId);
    const side = duel ? sideOf(duel, me._id) : null;
    if (!duel || !side) return null;
    const run = duel[RUN_FIELD[side]];
    const other = side === "a" ? "b" : "a";
    const opponent = await ctx.db.get("profiles", side === "a" ? duel.playerB : duel.playerA);
    return {
      status: duel.status,
      language: duel.language,
      runMinutes: duel.runMinutes,
      opponentName: opponent?.name ?? "?",
      opponentState: runState(duel[RUN_FIELD[other]]),
      deadline: duel.acceptedAt !== undefined ? duel.acceptedAt + DUEL_TTL_MS : null,
      run: run
        ? {
            startedAt: run.startedAt,
            endsAt: run.endsAt,
            endedAt: run.endedAt,
            endReason: run.endReason,
            guesses: run.guesses.map((word) => ({ word, colors: scoreGuess(word, duel.word) })),
          }
        : null,
      serverNow: Date.now(),
    };
  },
});

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, getProfile, requireMember, requireProfile } from "./model";
import { wordleLanguage, wordleRunMinutes } from "./schema";
import {
  DUEL_DEADLINE_MS,
  GRACE_MS,
  INVITE_TTL_MS,
  MAX_GUESSES,
  WORD_LENGTH,
  foldGuess,
  scoreGuess,
  type ResultSummary,
} from "./wordleRules";
import { isGuess, pickSolution } from "./wordleWords";

/** Parole dei Duel passati lette per non ripeterle: più di quante soluzioni ha una lista. */
const USED_WORDS_LIMIT = 3000;

type Side = "a" | "b";
type Run = NonNullable<Doc<"wordleDuels">["runA"]>;
type EndReason = NonNullable<Run["endReason"]>;
type Outcome = NonNullable<Doc<"wordleDuels">["outcome"]>;
/** I campi di ciascun giocatore: A è chi ha sfidato. */
const RUN_FIELD = { a: "runA", b: "runB" } as const;
const PLAYER_FIELD = { a: "playerA", b: "playerB" } as const;
const OTHER_SIDE = { a: "b", b: "a" } as const;

/** La Duel deadline: 24 ore dopo l'accettazione; null se l'invito non è stato accettato. */
function deadlineOf(duel: Doc<"wordleDuels">): number | null {
  return duel.acceptedAt !== undefined ? duel.acceptedAt + DUEL_DEADLINE_MS : null;
}

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

const runPatch = (side: Side, run: Run) => ({ [RUN_FIELD[side]]: run });

/** Chiude la Run, poi il Duel se è il momento. Il tempo della Run non supera mai il Run timer, anche nella tolleranza. */
async function endRun(ctx: MutationCtx, duel: Doc<"wordleDuels">, side: Side, run: Run, reason: EndReason, now: number) {
  await ctx.db.patch("wordleDuels", duel._id, runPatch(side, { ...run, endReason: reason, endedAt: Math.min(now, run.endsAt) }));
  await closeIfDone(ctx, duel._id);
}

/** Tempo della Run: da quando è stata aperta a quando è finita. */
const runTime = (run: Run) => (run.endedAt ?? run.endsAt) - run.startedAt;

/** La Run finita del giocatore, o null se non l'ha aperta o è ancora in corso. */
function finishedRun(duel: Doc<"wordleDuels">, side: Side): Run | null {
  const run = duel[RUN_FIELD[side]];
  return run?.endReason ? run : null;
}

/**
 * Come si chiude il Duel, dalle regole del vincitore. Chi non ha finito perde per forfeit;
 * se nessuno ha finito il Duel scade senza esito.
 */
function closingOf(duel: Doc<"wordleDuels">): { status: "closed"; outcome: Outcome } | { status: "expired" } {
  const a = finishedRun(duel, "a");
  const b = finishedRun(duel, "b");
  const win = (side: Side, reason: Outcome["reason"]) => ({ status: "closed" as const, outcome: { winner: duel[PLAYER_FIELD[side]], reason } });
  const draw = (reason: Outcome["reason"]) => ({ status: "closed" as const, outcome: { reason } });
  if (!a && !b) return { status: "expired" };
  if (!a || !b) return win(a ? "a" : "b", "forfeit");
  const solvedA = a.endReason === "solved";
  const solvedB = b.endReason === "solved";
  if (!solvedA && !solvedB) return draw("neitherGuessed");
  if (solvedA !== solvedB) return win(solvedA ? "a" : "b", "onlyOneGuessed");
  if (a.guesses.length !== b.guesses.length) return win(a.guesses.length < b.guesses.length ? "a" : "b", "fewerGuesses");
  if (runTime(a) !== runTime(b)) return win(runTime(a) < runTime(b) ? "a" : "b", "fasterRun");
  return draw("fasterRun"); // stessi tentativi e stesso tempo al millisecondo: pareggio
}

/** Chiude il Duel con il suo esito e lo annuncia in chat con un messaggio senza autore. */
async function closeDuel(ctx: MutationCtx, duel: Doc<"wordleDuels">) {
  await ctx.db.patch("wordleDuels", duel._id, { ...closingOf(duel), finishedAt: Date.now() });
  const members = await membersOf(ctx, duel.conversationId);
  await postDuelMessage(ctx, members, { conversationId: duel.conversationId, kind: "game", body: "wordle", wordleDuelId: duel._id });
}

/**
 * Dopo la fine di una Run e alla Duel deadline: il Duel si chiude subito se anche l'altra Run è finita,
 * oppure se la deadline è passata e nessuna Run è più in corso.
 */
async function closeIfDone(ctx: MutationCtx, duelId: Id<"wordleDuels">) {
  const duel = await ctx.db.get("wordleDuels", duelId);
  if (!duel || duel.status !== "open") return;
  const states = [runState(duel.runA), runState(duel.runB)];
  const deadline = deadlineOf(duel);
  const bothFinished = states.every((state) => state === "finished");
  const pastDeadline = deadline !== null && Date.now() >= deadline && !states.includes("playing");
  if (bothFinished || pastDeadline) await closeDuel(ctx, duel);
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
    await ctx.scheduler.runAt(now + DUEL_DEADLINE_MS, internal.wordleDuels.closeAtDeadline, { duelId: duel._id });
  },
});

/** Alla Duel deadline il Duel si chiude; una Run ancora in corso finisce prima il suo Run timer, poi chiude lei. */
export const closeAtDeadline = internalMutation({
  args: { duelId: v.id("wordleDuels") },
  handler: async (ctx, args) => {
    await closeIfDone(ctx, args.duelId);
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

/** Una Run finita come la mostra la scheda chiusa. */
function runView(run: Run | null, word: string) {
  if (!run?.endReason) return null;
  return { guesses: run.guesses.map((g) => ({ word: g, colors: scoreGuess(g, word) })), endReason: run.endReason, timeMs: runTime(run) };
}

/** Il lato di chi ha vinto, o null per un pareggio o un Duel senza esito. */
function winnerSideOf(duel: Doc<"wordleDuels">): Side | null {
  const winner = duel.outcome?.winner;
  return winner ? sideOf(duel, winner) : null;
}

/** Il Duel è finito dopo l'accettazione: chiuso con un esito, o scaduto senza che nessuno finisse. */
const isOver = (duel: Doc<"wordleDuels">) => duel.status === "closed" || (duel.status === "expired" && duel.acceptedAt !== undefined);

/** Il risultato completo, solo a Duel chiuso: la parola, le due Run e l'esito. Un Duel scaduto non mostra la parola. */
function resultOf(duel: Doc<"wordleDuels">) {
  if (duel.status !== "closed") return null;
  return {
    word: duel.word,
    outcome: duel.outcome ? { winner: winnerSideOf(duel), reason: duel.outcome.reason } : null,
    runs: { a: runView(finishedRun(duel, "a"), duel.word), b: runView(finishedRun(duel, "b"), duel.word) },
  };
}

/** Il risultato in breve di un Duel finito: chi vince, perché, e i tentativi. */
function resultSummaryOf(duel: Doc<"wordleDuels">, winnerName: string | null): ResultSummary {
  const winnerSide = winnerSideOf(duel);
  const guesses = (side: Side | null) => (side ? (finishedRun(duel, side)?.guesses.length ?? null) : null);
  return {
    status: duel.status === "closed" ? "closed" : "expired",
    winnerName,
    reason: duel.outcome?.reason ?? null,
    winnerGuesses: guesses(winnerSide),
    otherGuesses: guesses(winnerSide ? OTHER_SIDE[winnerSide] : null),
  };
}

/** Per la notifica del messaggio di chiusura. Null se il Duel non è finito dopo l'accettazione. */
export async function wordleResultSummary(ctx: QueryCtx, duelId: Id<"wordleDuels">): Promise<ResultSummary | null> {
  const duel = await ctx.db.get("wordleDuels", duelId);
  if (!duel || !isOver(duel)) return null;
  const winner = duel.outcome?.winner;
  return resultSummaryOf(duel, winner ? ((await ctx.db.get("profiles", winner))?.name ?? "?") : null);
}

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
    const nameA = a?.name ?? "?";
    const nameB = b?.name ?? "?";
    return {
      _id: duel._id,
      conversationId: duel.conversationId,
      status: duel.status,
      mySide: side,
      nameA,
      nameB,
      runMinutes: duel.runMinutes,
      language: duel.language,
      createdAt: duel.createdAt,
      expiresAt: duel.createdAt + INVITE_TTL_MS,
      acceptedAt: duel.acceptedAt ?? null,
      deadline: deadlineOf(duel),
      /** Solo lo stato e la fine del Run timer di chi guarda: mai i suoi tentativi qui. */
      myRun: side ? { state: runState(duel[RUN_FIELD[side]]), endsAt: duel[RUN_FIELD[side]]?.endsAt ?? null } : null,
      /** Lo stato di ogni Run: mai un risultato finché il Duel è aperto. */
      players: { a: runState(duel.runA), b: runState(duel.runB) },
      result: resultOf(duel),
      /** La riga di chiusura in breve, per il messaggio senza autore in chat. */
      summary: isOver(duel) ? resultSummaryOf(duel, { a: nameA, b: nameB, none: null }[winnerSideOf(duel) ?? "none"]) : null,
      /** Ora del server: la scheda corregge il proprio orologio per mostrare il tempo che resta (come `games.get`). */
      serverNow: Date.now(),
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
    const deadline = deadlineOf(duel);
    if (duel.status !== "open" || deadline === null || now >= deadline) throw fail("game_closed");
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
    const other = OTHER_SIDE[side];
    const opponent = await ctx.db.get("profiles", duel[PLAYER_FIELD[other]]);
    return {
      status: duel.status,
      language: duel.language,
      runMinutes: duel.runMinutes,
      opponentName: opponent?.name ?? "?",
      opponentState: runState(duel[RUN_FIELD[other]]),
      deadline: deadlineOf(duel),
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

/** Duel recenti mostrati nell'elenco della scheda "Giochi". */
const HISTORY_LIMIT = 50;
/** Duel letti per le statistiche, dal più recente. */
const STATS_LIMIT = 500;

/**
 * Duel chiusi di una chat e statistiche, per la scheda "Giochi" di Media. Contano i Duel chiusi, forfeit compresi;
 * per ogni giocatore le vittorie e la media dei tentativi sulle sole parole indovinate.
 */
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

    const closed = await ctx.db
      .query("wordleDuels")
      .withIndex("by_conversation_and_status", (q) => q.eq("conversationId", args.conversationId).eq("status", "closed"))
      .order("desc")
      .take(STATS_LIMIT);

    const names = new Map<Id<"profiles">, string>();
    const nameOf = async (id: Id<"profiles">) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get("profiles", id))?.name ?? "?");
      return names.get(id)!;
    };
    const players = new Map<Id<"profiles">, { profileId: Id<"profiles">; name: string; wins: number; guessed: number; guesses: number }>();
    const entry = async (id: Id<"profiles">) => {
      if (!players.has(id)) players.set(id, { profileId: id, name: await nameOf(id), wins: 0, guessed: 0, guesses: 0 });
      return players.get(id)!;
    };
    /** Tentativi della parola indovinata, o null se il giocatore non l'ha indovinata. */
    const solvedIn = (duel: Doc<"wordleDuels">, side: Side) => {
      const run = finishedRun(duel, side);
      return run?.endReason === "solved" ? run.guesses.length : null;
    };

    let draws = 0;
    for (const duel of closed) {
      for (const side of ["a", "b"] as const) {
        const player = await entry(duel[PLAYER_FIELD[side]]);
        const n = solvedIn(duel, side);
        if (n !== null) {
          player.guessed += 1;
          player.guesses += n;
        }
      }
      if (duel.outcome?.winner) (await entry(duel.outcome.winner)).wins += 1;
      else draws += 1;
    }

    const recent = await Promise.all(
      closed.slice(0, HISTORY_LIMIT).map(async (duel) => ({
        _id: duel._id,
        finishedAt: duel.finishedAt ?? duel._creationTime,
        nameA: await nameOf(duel.playerA),
        nameB: await nameOf(duel.playerB),
        guessesA: solvedIn(duel, "a"),
        guessesB: solvedIn(duel, "b"),
        runMinutes: duel.runMinutes,
        language: duel.language,
        winnerSide: winnerSideOf(duel),
      })),
    );
    return {
      total: closed.length,
      draws,
      players: [...players.values()].map(({ profileId, name, wins, guessed, guesses }) => ({
        profileId,
        name,
        wins,
        averageGuesses: guessed > 0 ? guesses / guessed : null,
      })),
      recent,
    };
  },
});

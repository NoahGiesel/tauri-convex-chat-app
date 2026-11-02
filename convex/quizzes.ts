import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { ACTIVE_QUIZ } from "./games";
import { QUIZ_COUNTDOWN_MS, QUIZ_GRACE_MS, QUIZ_REVEAL_MS, QUIZ_SIZES, cleanTopics, interleave, parseQuestions } from "./quizRules";
import { fail, getProfile, requireMember, requireProfile } from "./model";
import { aiModel } from "./summaryPrompt";

const HISTORY_LIMIT = 50;
const STATS_LIMIT = 500;
const LANGUAGES: Record<string, string> = { en: "English", it: "Italian", de: "German", ro: "Romanian", es: "Spanish" };

async function scheduleResolve(ctx: MutationCtx, quizId: Id<"quizzes">, round: number, endsAt: number) {
  await ctx.scheduler.runAt(endsAt + QUIZ_GRACE_MS + 100, internal.quizzes.resolveRound, { quizId, round });
}

/** `/quiz3` o `/quiz5`: apre una sfida a quiz con l'altra persona di una chat diretta (3 o 5 argomenti a testa). */
export const start = mutation({
  args: { conversationId: v.id("conversations"), size: v.number(), language: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    if (!(QUIZ_SIZES as readonly number[]).includes(args.size)) throw fail("quiz_invalid_topics");
    const conversation = await ctx.db.get("conversations", args.conversationId);
    if (!conversation || conversation.kind !== "direct") throw fail("game_direct_only");

    const members = await ctx.db
      .query("members")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .take(5);
    const peer = members.find((m) => m.profileId !== me._id);
    if (!peer) throw fail("game_direct_only");

    const games = await ctx.db.query("games").withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId)).order("desc").take(5);
    const quizzes = await ctx.db.query("quizzes").withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId)).order("desc").take(5);
    if (games.some((g) => g.status === "invite" || g.status === "playing") || quizzes.some((z) => ACTIVE_QUIZ.has(z.status))) {
      throw fail("game_in_progress");
    }

    const now = Date.now();
    const quizId = await ctx.db.insert("quizzes", {
      conversationId: args.conversationId,
      playerA: me._id,
      playerB: peer.profileId,
      size: args.size,
      language: args.language,
      status: "setup",
      topicsA: [],
      topicsB: [],
      questions: [],
      answers: [],
      scoreA: 0,
      scoreB: 0,
    });
    await ctx.db.insert("messages", { conversationId: args.conversationId, authorId: me._id, kind: "game", body: "quiz", quizId });
    await ctx.db.patch("conversations", args.conversationId, { lastMessageAt: now });
    for (const m of members) {
      await ctx.db.patch("members", m._id, m.profileId === me._id ? { lastMessageAt: now, lastReadAt: now } : { lastMessageAt: now });
    }
    return quizId;
  },
});

/** Ognuno dà i propri argomenti: prima chi ha sfidato (poi parte l'invito), poi lo sfidato accettando (poi si scrivono le domande). */
export const submitTopics = mutation({
  args: { quizId: v.id("quizzes"), topics: v.array(v.string()), random: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz) throw fail("game_closed");
    await requireMember(ctx, quiz.conversationId, me._id);
    // Con "casuale" non servono argomenti: li sceglie l'AI.
    const random = args.random === true;
    const topics = random ? [] : cleanTopics(args.topics, quiz.size);
    if (!topics) throw fail("quiz_invalid_topics");

    if (quiz.status === "setup" && quiz.playerA === me._id) {
      await ctx.db.patch("quizzes", quiz._id, { topicsA: topics, randomA: random, status: "invite" });
      return;
    }
    if (quiz.status === "invite" && quiz.playerB === me._id) {
      await ctx.db.patch("quizzes", quiz._id, { topicsB: topics, randomB: random, status: "generating" });
      await ctx.scheduler.runAfter(0, internal.quizzes.generate, { quizId: quiz._id });
      return;
    }
    throw fail("game_closed");
  },
});

/** Lo sfidato rifiuta; chi ha sfidato ritira la sfida (finché non è partito il gioco). */
export const respond = mutation({
  args: { quizId: v.id("quizzes"), action: v.union(v.literal("decline"), v.literal("cancel")) },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz) throw fail("game_closed");
    await requireMember(ctx, quiz.conversationId, me._id);
    if (quiz.status !== "setup" && quiz.status !== "invite") throw fail("game_closed");
    if (args.action === "cancel" && quiz.playerA === me._id) {
      await ctx.db.patch("quizzes", quiz._id, { status: "cancelled", finishedAt: Date.now() });
    } else if (args.action === "decline" && quiz.playerB === me._id && quiz.status === "invite") {
      await ctx.db.patch("quizzes", quiz._id, { status: "declined", finishedAt: Date.now() });
    } else {
      throw fail("not_member");
    }
  },
});

// ---------- scrittura delle domande ----------

export const forGeneration = internalQuery({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz || quiz.status !== "generating") return null;
    // Un posto per ogni domanda; `null` = argomento a scelta dell'AI.
    const slots = (topics: string[], random: boolean | undefined): (string | null)[] =>
      random ? Array.from({ length: quiz.size }, () => null) : topics;
    return { topics: interleave(slots(quiz.topicsA, quiz.randomA), slots(quiz.topicsB, quiz.randomB)), language: quiz.language };
  },
});

export const setQuestions = internalMutation({
  args: {
    quizId: v.id("quizzes"),
    questions: v.array(v.object({ topic: v.string(), text: v.string(), options: v.array(v.string()), correct: v.number() })),
  },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz || quiz.status !== "generating") return;
    const endsAt = Date.now() + QUIZ_COUNTDOWN_MS;
    await ctx.db.patch("quizzes", quiz._id, { questions: args.questions, status: "playing", endsAt });
    await scheduleResolve(ctx, quiz._id, 0, endsAt);
  },
});

export const markFailed = internalMutation({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (quiz && quiz.status === "generating") await ctx.db.patch("quizzes", quiz._id, { status: "failed", finishedAt: Date.now() });
  },
});

/** Chiede al modello una domanda per argomento (4 opzioni, una giusta) e fa partire il gioco. */
export const generate = internalAction({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const input = await ctx.runQuery(internal.quizzes.forGeneration, { quizId: args.quizId });
    if (!input) return;
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.quizzes.markFailed, { quizId: args.quizId });
      return;
    }

    const language = LANGUAGES[input.language] ?? "English";
    const system = `You write multiple-choice trivia questions for a friendly two-player quiz.
Return ONLY a JSON object: {"questions":[{"topic":"...","question":"...","options":["...","...","...","..."],"correct":0}]}
Rules:
- Exactly one question per entry of the list, in the same order, so the "questions" array has the same length as the list. "topic" is the topic of the question.
- An entry marked (your choice) has no topic: pick a fun, varied topic yourself (different from the other entries, science, history, geography, cinema, music, sport, nature, food, technology… ) and write its short name in "topic".
- Each question must clearly be about its topic, be factual, have exactly one unambiguously correct option among 4 short, distinct options, and be of medium difficulty (not obscure). "correct" is the 0-based index of the right option.
- Keep it friendly and safe for everyone: if a topic is hateful, sexual or dangerous, ask a harmless general-knowledge question instead.
- Write the questions and options in ${language}. No explanations, no markdown, no text outside the JSON.`;
    const user = `Entries (${input.topics.length}):\n${input.topics.map((t, i) => `${i + 1}. ${t ?? "(your choice)"}`).join("\n")}`;

    let questions = null;
    for (let attempt = 0; attempt < 2 && !questions; attempt++) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Friends Chat" },
        body: JSON.stringify({
          model: aiModel(),
          max_tokens: 2500,
          temperature: 0.7,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      }).catch(() => null);
      if (!res || !res.ok) {
        console.error("OpenRouter quiz", res?.status, await res?.text().catch(() => ""));
        continue;
      }
      const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
      questions = parseQuestions(data?.choices?.[0]?.message?.content ?? "", input.topics);
    }

    if (!questions) {
      await ctx.runMutation(internal.quizzes.markFailed, { quizId: args.quizId });
      return;
    }
    await ctx.runMutation(internal.quizzes.setQuestions, { quizId: args.quizId, questions });
  },
});

// ---------- il gioco ----------

/** Sceglie (o cambia) la risposta del round in corso, finché dura il conto alla rovescia. */
export const answer = mutation({
  args: { quizId: v.id("quizzes"), option: v.number() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz) throw fail("game_closed");
    const side = quiz.playerA === me._id ? "a" : quiz.playerB === me._id ? "b" : null;
    if (!side) throw fail("not_member");
    if (quiz.status !== "playing" || quiz.endsAt === undefined || Date.now() > quiz.endsAt + QUIZ_GRACE_MS) throw fail("game_closed");
    if (!Number.isInteger(args.option) || args.option < 0 || args.option > 3) throw fail("game_closed");
    await ctx.db.patch("quizzes", quiz._id, side === "a" ? { pickA: args.option } : { pickB: args.option });
  },
});

/** Chiude il round: segna le risposte, aggiorna il punteggio e passa alla domanda dopo (o chiude il quiz). */
export const resolveRound = internalMutation({
  args: { quizId: v.id("quizzes"), round: v.number() },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz || quiz.status !== "playing" || quiz.answers.length !== args.round || quiz.endsAt === undefined) return;
    const question = quiz.questions[args.round];
    const answers = [...quiz.answers, { a: quiz.pickA, b: quiz.pickB }];
    const scoreA = quiz.scoreA + (quiz.pickA === question.correct ? 1 : 0);
    const scoreB = quiz.scoreB + (quiz.pickB === question.correct ? 1 : 0);
    const base = { answers, scoreA, scoreB, pickA: undefined, pickB: undefined, endsAt: undefined };

    if (answers.length >= quiz.questions.length) {
      await ctx.db.patch("quizzes", quiz._id, {
        ...base,
        status: "done",
        nextRoundAt: undefined,
        winnerId: scoreA === scoreB ? undefined : scoreA > scoreB ? quiz.playerA : quiz.playerB,
        finishedAt: Date.now(),
      });
      return;
    }
    const nextRoundAt = Date.now() + QUIZ_REVEAL_MS;
    await ctx.db.patch("quizzes", quiz._id, { ...base, nextRoundAt });
    await ctx.scheduler.runAt(nextRoundAt, internal.quizzes.beginRound, { quizId: quiz._id, round: answers.length });
  },
});

export const beginRound = internalMutation({
  args: { quizId: v.id("quizzes"), round: v.number() },
  handler: async (ctx, args) => {
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz || quiz.status !== "playing" || quiz.answers.length !== args.round) return;
    const endsAt = Date.now() + QUIZ_COUNTDOWN_MS;
    await ctx.db.patch("quizzes", quiz._id, { endsAt, nextRoundAt: undefined });
    await scheduleResolve(ctx, quiz._id, args.round, endsAt);
  },
});

/** Stato del quiz per chi lo guarda. La risposta giusta e le scelte dell'altro restano nascoste finché il round non si chiude. */
export const get = query({
  args: { quizId: v.id("quizzes") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    const quiz = await ctx.db.get("quizzes", args.quizId);
    if (!quiz) return null;
    const member = await ctx.db
      .query("members")
      .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", quiz.conversationId).eq("profileId", me._id))
      .unique();
    if (!member) return null;

    const [a, b] = await Promise.all([ctx.db.get("profiles", quiz.playerA), ctx.db.get("profiles", quiz.playerB)]);
    const mySide = quiz.playerA === me._id ? "a" : quiz.playerB === me._id ? "b" : null;
    const open = quiz.status === "playing" && quiz.endsAt !== undefined ? quiz.questions[quiz.answers.length] : undefined;
    return {
      _id: quiz._id,
      conversationId: quiz.conversationId,
      status: quiz.status,
      size: quiz.size,
      language: quiz.language,
      mySide,
      nameA: a?.name ?? "?",
      nameB: b?.name ?? "?",
      scoreA: quiz.scoreA,
      scoreB: quiz.scoreB,
      total: quiz.size * 2,
      roundNo: quiz.answers.length + 1,
      current: open ? { topic: open.topic, text: open.text, options: open.options } : null,
      rounds: quiz.answers.map((r, i) => ({ ...quiz.questions[i], a: r.a ?? null, b: r.b ?? null })),
      endsAt: quiz.endsAt ?? null,
      nextRoundAt: quiz.nextRoundAt ?? null,
      myPick: mySide === "a" ? (quiz.pickA ?? null) : mySide === "b" ? (quiz.pickB ?? null) : null,
      opponentPicked: mySide === "a" ? quiz.pickB !== undefined : mySide === "b" ? quiz.pickA !== undefined : false,
      winnerSide: quiz.winnerId ? (quiz.winnerId === quiz.playerA ? ("a" as const) : ("b" as const)) : null,
      serverNow: Date.now(),
    };
  },
});

/** Quiz finiti di una chat e statistiche (per la scheda "Giochi" di Media). */
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

    const quizzes = await ctx.db
      .query("quizzes")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(STATS_LIMIT);
    const done = quizzes.filter((z) => z.status === "done");

    const names = new Map<Id<"profiles">, string>();
    const nameOf = async (id: Id<"profiles">) => {
      if (!names.has(id)) names.set(id, (await ctx.db.get("profiles", id))?.name ?? "?");
      return names.get(id)!;
    };
    const players = new Map<Id<"profiles">, { profileId: Id<"profiles">; name: string; wins: number; points: number }>();
    const entry = async (id: Id<"profiles">) => {
      if (!players.has(id)) players.set(id, { profileId: id, name: await nameOf(id), wins: 0, points: 0 });
      return players.get(id)!;
    };
    let draws = 0;
    for (const z of done) {
      (await entry(z.playerA)).points += z.scoreA;
      (await entry(z.playerB)).points += z.scoreB;
      if (z.winnerId) (await entry(z.winnerId)).wins += 1;
      else draws += 1;
    }

    const recent = await Promise.all(
      done.slice(0, HISTORY_LIMIT).map(async (z) => ({
        _id: z._id,
        finishedAt: z.finishedAt ?? z._creationTime,
        nameA: await nameOf(z.playerA),
        nameB: await nameOf(z.playerB),
        scoreA: z.scoreA,
        scoreB: z.scoreB,
        size: z.size,
        total: z.size * 2,
        winnerSide: z.winnerId ? (z.winnerId === z.playerA ? ("a" as const) : ("b" as const)) : null,
      })),
    );
    return { total: done.length, draws, players: [...players.values()], recent };
  },
});

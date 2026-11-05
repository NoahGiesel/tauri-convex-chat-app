/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { DUEL_DEADLINE_MS, INVITE_TTL_MS } from "./wordleRules";

const modules = import.meta.glob("./**/*.ts");

/** Alice e Bob con una chat diretta; Carol con loro in un gruppo. */
async function twoFriends() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const profile = (name: string) =>
      ctx.db.insert("profiles", { tokenIdentifier: `test|${name}`, name, email: `${name}@example.com`, avatarIndex: 0 });
    const alice = await profile("alice");
    const bob = await profile("bob");
    const carol = await profile("carol");
    const now = Date.now();
    const direct = await ctx.db.insert("conversations", { kind: "direct", createdBy: alice, directKey: `${alice}_${bob}`, lastMessageAt: now });
    const group = await ctx.db.insert("conversations", { kind: "group", name: "Weekend", createdBy: alice, lastMessageAt: now });
    for (const [conversationId, profileId] of [
      [direct, alice],
      [direct, bob],
      [group, alice],
      [group, bob],
      [group, carol],
    ] as const) {
      await ctx.db.insert("members", { conversationId, profileId, lastReadAt: now, lastMessageAt: now });
    }
    return { direct, group };
  });
  return {
    t,
    ...ids,
    alice: t.withIdentity({ tokenIdentifier: "test|alice" }),
    bob: t.withIdentity({ tokenIdentifier: "test|bob" }),
    carol: t.withIdentity({ tokenIdentifier: "test|carol" }),
  };
}

const errorCode = (e: unknown) => (e as { data?: { code?: string } }).data?.code;

async function challenge(f: Awaited<ReturnType<typeof twoFriends>>) {
  return await f.alice.mutation(api.wordleDuels.start, { conversationId: f.direct, runMinutes: 5, language: "it" });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("invito", () => {
  it("parte in una chat diretta, con un messaggio che lo mostra", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);

    const card = await f.bob.query(api.wordleDuels.get, { duelId });
    expect(card).toMatchObject({ status: "invite", mySide: "b", nameA: "alice", nameB: "bob", runMinutes: 5, language: "it" });
    expect(card?.expiresAt).toBe(card!.createdAt + INVITE_TTL_MS);
    const messages = await f.t.run((ctx) => ctx.db.query("messages").collect());
    expect(messages).toMatchObject([{ kind: "game", wordleDuelId: duelId }]);
  });

  it("non rivela la parola", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    const word = await f.t.run(async (ctx) => (await ctx.db.get("wordleDuels", duelId))!.word);

    for (const who of [f.alice, f.bob]) expect(JSON.stringify(await who.query(api.wordleDuels.get, { duelId }))).not.toContain(word);
  });

  it("non parte in un gruppo", async () => {
    const f = await twoFriends();
    await expect(f.alice.mutation(api.wordleDuels.start, { conversationId: f.group, runMinutes: 1, language: "en" })).rejects.toSatisfy(
      (e) => errorCode(e) === "game_direct_only",
    );
  });

  it("non parte da chi non è nella chat", async () => {
    const f = await twoFriends();
    await expect(f.carol.mutation(api.wordleDuels.start, { conversationId: f.direct, runMinutes: 1, language: "en" })).rejects.toSatisfy(
      (e) => errorCode(e) === "not_member",
    );
  });

  it("nessuno di fuori vede la scheda", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    expect(await f.carol.query(api.wordleDuels.get, { duelId })).toBeNull();
  });
});

describe("un solo Duel aperto per chat", () => {
  it("un invito in attesa blocca un altro Duel", async () => {
    const f = await twoFriends();
    await challenge(f);
    await expect(f.bob.mutation(api.wordleDuels.start, { conversationId: f.direct, runMinutes: 1, language: "en" })).rejects.toSatisfy(
      (e) => errorCode(e) === "wordle_in_progress",
    );
  });

  it("un Duel accettato blocca un altro Duel", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    await f.bob.mutation(api.wordleDuels.respond, { duelId, action: "accept" });
    await expect(challenge(f)).rejects.toSatisfy((e) => errorCode(e) === "wordle_in_progress");
  });

  it("un invito rifiutato, ritirato o scaduto non blocca più", async () => {
    const f = await twoFriends();
    const first = await challenge(f);
    await f.bob.mutation(api.wordleDuels.respond, { duelId: first, action: "decline" });
    const second = await challenge(f);
    await f.alice.mutation(api.wordleDuels.respond, { duelId: second, action: "withdraw" });
    await challenge(f);
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(challenge(f)).resolves.toBeDefined();
  });

  it("convive con sasso-carta-forbici, in tutti e due i versi", async () => {
    const f = await twoFriends();
    await f.alice.mutation(api.games.start, { conversationId: f.direct });
    await challenge(f);
    const g = await twoFriends();
    await challenge(g);
    await expect(g.alice.mutation(api.games.start, { conversationId: g.direct })).resolves.toBeDefined();
  });

  it("convive con il quiz, in tutti e due i versi", async () => {
    const f = await twoFriends();
    await f.alice.mutation(api.quizzes.start, { conversationId: f.direct, size: 3, language: "it" });
    await challenge(f);
    const g = await twoFriends();
    await challenge(g);
    await expect(g.alice.mutation(api.quizzes.start, { conversationId: g.direct, size: 3, language: "it" })).resolves.toBeDefined();
  });
});

describe("risposta all'invito", () => {
  it("lo sfidato accetta: il Duel è aperto", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    await f.bob.mutation(api.wordleDuels.respond, { duelId, action: "accept" });
    const card = await f.alice.query(api.wordleDuels.get, { duelId });
    expect(card?.status).toBe("open");
    expect(card?.acceptedAt).toEqual(expect.any(Number));
  });

  it("lo sfidato rifiuta", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    await f.bob.mutation(api.wordleDuels.respond, { duelId, action: "decline" });
    expect((await f.alice.query(api.wordleDuels.get, { duelId }))?.status).toBe("declined");
  });

  it("chi sfida ritira l'invito", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    await f.alice.mutation(api.wordleDuels.respond, { duelId, action: "withdraw" });
    expect((await f.bob.query(api.wordleDuels.get, { duelId }))?.status).toBe("withdrawn");
  });

  it("chi sfida non può accettare né rifiutare, lo sfidato non può ritirare", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    for (const action of ["accept", "decline"] as const) {
      await expect(f.alice.mutation(api.wordleDuels.respond, { duelId, action })).rejects.toSatisfy((e) => errorCode(e) === "not_member");
    }
    await expect(f.bob.mutation(api.wordleDuels.respond, { duelId, action: "withdraw" })).rejects.toSatisfy((e) => errorCode(e) === "not_member");
  });

  it("un invito già chiuso non si riapre", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    await f.bob.mutation(api.wordleDuels.respond, { duelId, action: "decline" });
    await expect(f.bob.mutation(api.wordleDuels.respond, { duelId, action: "accept" })).rejects.toSatisfy((e) => errorCode(e) === "game_closed");
  });
});

describe("scadenza dell'invito", () => {
  it("dopo 24 ore senza risposta l'invito scade, senza nuovi messaggi", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    vi.advanceTimersByTime(INVITE_TTL_MS - 1000);
    await f.t.finishInProgressScheduledFunctions();
    expect((await f.bob.query(api.wordleDuels.get, { duelId }))?.status).toBe("invite");

    vi.advanceTimersByTime(1000);
    await f.t.finishInProgressScheduledFunctions();
    expect((await f.bob.query(api.wordleDuels.get, { duelId }))?.status).toBe("expired");
    expect(await f.t.run((ctx) => ctx.db.query("messages").collect())).toHaveLength(1);
    await expect(f.bob.mutation(api.wordleDuels.respond, { duelId, action: "accept" })).rejects.toSatisfy((e) => errorCode(e) === "game_closed");
  });

  it("un invito accettato non scade", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    vi.advanceTimersByTime(60_000);
    await f.bob.mutation(api.wordleDuels.respond, { duelId, action: "accept" });
    vi.advanceTimersByTime(INVITE_TTL_MS - 60_000);
    await f.t.finishInProgressScheduledFunctions();
    expect((await f.bob.query(api.wordleDuels.get, { duelId }))?.status).toBe("open");
  });
});

describe("scelta della parola", () => {
  async function wordOf(f: Awaited<ReturnType<typeof twoFriends>>, duelId: Id<"wordleDuels">) {
    return await f.t.run(async (ctx) => (await ctx.db.get("wordleDuels", duelId))!.word);
  }

  it("non ripete una parola già giocata nella chat e nella lingua", async () => {
    const f = await twoFriends();
    vi.spyOn(Math, "random").mockReturnValue(0); // senza il filtro uscirebbe sempre la stessa parola
    const words = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const duelId: Id<"wordleDuels"> = await challenge(f);
      await f.bob.mutation(api.wordleDuels.respond, { duelId, action: "accept" });
      words.add(await wordOf(f, duelId));
      await f.t.run((ctx) => ctx.db.patch("wordleDuels", duelId, { status: "closed" }));
    }
    expect(words.size).toBe(5);
  });

  it("la parola di un invito mai accettato resta libera", async () => {
    const f = await twoFriends();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const first = await challenge(f);
    await f.bob.mutation(api.wordleDuels.respond, { duelId: first, action: "decline" });
    const second = await challenge(f);
    expect(await wordOf(f, second)).toBe(await wordOf(f, first));
  });
});

/** Duel inglese da 1 minuto già accettato, con la parola fissata dal test. */
async function openDuel(word: string) {
  const f = await twoFriends();
  const duelId = await f.alice.mutation(api.wordleDuels.start, { conversationId: f.direct, runMinutes: 1, language: "en" });
  await f.bob.mutation(api.wordleDuels.respond, { duelId, action: "accept" });
  await f.t.run((ctx) => ctx.db.patch("wordleDuels", duelId, { word }));
  return { ...f, duelId };
}

const RUN_MS = 60_000;

describe("Run", () => {
  it("si apre solo a Duel accettato, e aprirla fa partire il Run timer", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    await expect(f.bob.mutation(api.wordleDuels.openRun, { duelId })).rejects.toSatisfy((e) => errorCode(e) === "game_closed");

    await f.bob.mutation(api.wordleDuels.respond, { duelId, action: "accept" });
    await f.bob.mutation(api.wordleDuels.openRun, { duelId });
    const run = (await f.bob.query(api.wordleDuels.myRun, { duelId }))!.run!;
    expect(run.endsAt - run.startedAt).toBe(5 * 60_000);
    expect(run.guesses).toEqual([]);
  });

  it("riaprirla non rimette a zero il tempo", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    const first = (await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run!;
    vi.advanceTimersByTime(10_000);
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    expect((await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run).toMatchObject({ startedAt: first.startedAt, endsAt: first.endsAt });
  });

  it("chi non gioca nel Duel non apre una Run", async () => {
    const f = await openDuel("crane");
    await expect(f.carol.mutation(api.wordleDuels.openRun, { duelId: f.duelId })).rejects.toSatisfy((e) => errorCode(e) === "not_member");
  });

  it("non si tenta senza aver aperto la Run", async () => {
    const f = await openDuel("crane");
    await expect(f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "slate" })).rejects.toSatisfy(
      (e) => errorCode(e) === "wordle_run_over",
    );
  });
});

describe("colori", () => {
  async function colorsOf(word: string, guess: string) {
    const f = await openDuel(word);
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    await f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: guess });
    return (await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run!.guesses[0];
  }

  it("verde al posto giusto, giallo altrove, grigio se manca", async () => {
    expect(await colorsOf("crane", "slate")).toEqual({ word: "slate", colors: ["absent", "absent", "correct", "absent", "correct"] });
    expect(await colorsOf("crane", "react")).toEqual({ word: "react", colors: ["present", "present", "correct", "present", "absent"] });
  });

  it("una lettera ripetuta è gialla solo quante volte compare nella parola", async () => {
    expect((await colorsOf("abide", "speed")).colors).toEqual(["absent", "absent", "present", "absent", "present"]);
  });

  it("il verde ha la precedenza sul giallo di una lettera ripetuta", async () => {
    expect((await colorsOf("crane", "eerie")).colors).toEqual(["absent", "absent", "present", "absent", "correct"]);
  });

  it("due lettere uguali nella parola possono essere due gialli", async () => {
    expect((await colorsOf("spool", "loops")).colors).toEqual(["present", "present", "correct", "present", "present"]);
  });
});

describe("tentativi", () => {
  it("si controlla in minuscolo e indovinare chiude la Run", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    vi.advanceTimersByTime(7_000);
    await f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "CRANE" });
    const run = (await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run!;
    expect(run).toMatchObject({ endReason: "solved", guesses: [{ word: "crane" }] });
    expect(run.endedAt! - run.startedAt).toBeCloseTo(7_000, -2); // convex-test sposta l'orologio di qualche ms
    await expect(f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "slate" })).rejects.toSatisfy(
      (e) => errorCode(e) === "wordle_run_over",
    );
  });

  it("una parola fuori lista o corta è respinta, non si salva e non conta", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    await expect(f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "xxxxx" })).rejects.toSatisfy(
      (e) => errorCode(e) === "wordle_not_a_word",
    );
    await expect(f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "cran" })).rejects.toSatisfy(
      (e) => errorCode(e) === "wordle_short",
    );
    expect((await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run!.guesses).toEqual([]);
  });

  it("sei errori chiudono la Run", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    for (const word of ["slate", "pious", "dough", "lymph", "fight", "brisk"]) {
      await f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word });
    }
    expect((await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run).toMatchObject({ endReason: "missed" });
    await expect(f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "crane" })).rejects.toSatisfy(
      (e) => errorCode(e) === "wordle_run_over",
    );
  });
});

describe("tempo", () => {
  it("un tentativo entro la tolleranza dopo la fine conta ancora", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    vi.advanceTimersByTime(RUN_MS + 400);
    await f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "crane" });
    const run = (await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run!;
    expect(run.endReason).toBe("solved");
    expect(run.endedAt).toBe(run.endsAt); // il tempo della Run non supera il Run timer
  });

  it("oltre la tolleranza il tentativo è respinto", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    vi.advanceTimersByTime(RUN_MS + 600);
    await expect(f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "crane" })).rejects.toSatisfy(
      (e) => errorCode(e) === "wordle_run_over",
    );
  });

  it("allo scadere un lavoro programmato chiude la Run con timeout, anche a finestra chiusa", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    await f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "slate" });
    vi.advanceTimersByTime(RUN_MS + 400);
    await f.t.finishInProgressScheduledFunctions();
    expect((await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run!.endReason).toBeUndefined();

    vi.advanceTimersByTime(200);
    await f.t.finishInProgressScheduledFunctions();
    const run = (await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run!;
    expect(run).toMatchObject({ endReason: "timeout", endedAt: run.endsAt, guesses: [{ word: "slate" }] });
  });

  it("il lavoro programmato non tocca una Run già finita", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    await f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "crane" });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run!.endReason).toBe("solved");
  });
});

describe("arrendersi", () => {
  it("chiude la Run con gaveUp", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    vi.advanceTimersByTime(3_000);
    await f.alice.mutation(api.wordleDuels.giveUp, { duelId: f.duelId });
    const run = (await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId }))!.run!;
    expect(run.endReason).toBe("gaveUp");
    expect(run.endedAt! - run.startedAt).toBeCloseTo(3_000, -2);
  });

  it("non si arrende chi non ha una Run in corso", async () => {
    const f = await openDuel("crane");
    await expect(f.alice.mutation(api.wordleDuels.giveUp, { duelId: f.duelId })).rejects.toSatisfy((e) => errorCode(e) === "wordle_run_over");
  });
});

describe("segretezza", () => {
  it("mentre il Duel è aperto nessuna query dà la parola o i tentativi dell'altro", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    await f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "slate" });
    await f.alice.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "crane" });

    const bobRun = await f.bob.query(api.wordleDuels.myRun, { duelId: f.duelId });
    expect(bobRun?.run).toBeNull();
    for (const who of [f.alice, f.bob]) {
      const card = JSON.stringify(await who.query(api.wordleDuels.get, { duelId: f.duelId }));
      expect(card).not.toContain("crane");
      expect(card).not.toContain("slate");
    }
    expect(JSON.stringify(bobRun)).not.toContain("crane");
    expect(JSON.stringify(bobRun)).not.toContain("slate");
  });

  it("la Run di chi chiede dà l'ora del server e la fine del Run timer", async () => {
    const f = await openDuel("crane");
    await f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    const mine = await f.alice.query(api.wordleDuels.myRun, { duelId: f.duelId });
    expect(mine).toMatchObject({ serverNow: expect.any(Number), run: { endsAt: expect.any(Number) } });
  });

  it("chi non è nella chat non vede nessuna Run", async () => {
    const f = await openDuel("crane");
    expect(await f.carol.query(api.wordleDuels.myRun, { duelId: f.duelId })).toBeNull();
  });
});

type Duel = Awaited<ReturnType<typeof openDuel>>;
type Player = "alice" | "bob";

/** Apre la Run del giocatore, aspetta `waitMs` e prova le parole in ordine. */
async function play(f: Duel, who: Player, words: string[], waitMs = 0) {
  await f[who].mutation(api.wordleDuels.openRun, { duelId: f.duelId });
  vi.advanceTimersByTime(waitMs);
  for (const word of words) await f[who].mutation(api.wordleDuels.guess, { duelId: f.duelId, word });
}

async function quit(f: Duel, who: Player) {
  await f[who].mutation(api.wordleDuels.openRun, { duelId: f.duelId });
  await f[who].mutation(api.wordleDuels.giveUp, { duelId: f.duelId });
}

const cardOf = (f: Duel, who: Player = "alice") => f[who].query(api.wordleDuels.get, { duelId: f.duelId });

/** I messaggi della chat diretta, dal più vecchio. */
const chatMessages = (f: Duel) =>
  f.t.run((ctx) => ctx.db.query("messages").withIndex("by_conversation", (q) => q.eq("conversationId", f.direct)).collect());

/** Un secondo di margine: convex-test sposta l'orologio di qualche ms tra una chiamata e l'altra. */
const PAST_DEADLINE_MS = DUEL_DEADLINE_MS + 1_000;

async function passDeadline(f: Duel) {
  vi.advanceTimersByTime(PAST_DEADLINE_MS);
  await f.t.finishInProgressScheduledFunctions();
}

describe("esito", () => {
  it("vince chi indovina con meno tentativi", async () => {
    const f = await openDuel("crane");
    await play(f, "alice", ["slate", "crane"]);
    await play(f, "bob", ["crane"]);
    const card = (await cardOf(f))!;
    expect(card.status).toBe("closed");
    expect(card.result?.outcome).toEqual({ winner: "b", reason: "fewerGuesses" });
  });

  it("a parità di tentativi vince la Run più veloce", async () => {
    const f = await openDuel("crane");
    await play(f, "alice", ["slate", "crane"], 2_000);
    await play(f, "bob", ["slate", "crane"], 5_000);
    expect((await cardOf(f))!.result?.outcome).toEqual({ winner: "a", reason: "fasterRun" });
  });

  it("indovinare batte non indovinare, anche con più tentativi", async () => {
    const f = await openDuel("crane");
    await play(f, "alice", ["slate", "pious", "dough", "lymph", "fight", "crane"]);
    await quit(f, "bob");
    expect((await cardOf(f))!.result?.outcome).toEqual({ winner: "a", reason: "onlyOneGuessed" });
  });

  it("se nessuno indovina è un pareggio", async () => {
    const f = await openDuel("crane");
    await play(f, "alice", ["slate", "pious", "dough", "lymph", "fight", "brisk"]);
    await quit(f, "bob");
    const card = (await cardOf(f))!;
    expect(card.status).toBe("closed");
    expect(card.result?.outcome).toEqual({ winner: null, reason: "neitherGuessed" });
  });
});

describe("chiusura", () => {
  it("resta aperto e nasconde tutto finché la seconda Run non finisce", async () => {
    const f = await openDuel("crane");
    await play(f, "alice", ["slate", "crane"]);
    const card = (await cardOf(f, "bob"))!;
    expect(card).toMatchObject({ status: "open", result: null, players: { a: "finished", b: "toPlay" } });
    expect(JSON.stringify(card)).not.toContain("crane");

    await f.bob.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    expect((await cardOf(f))!.players).toEqual({ a: "finished", b: "playing" });
  });

  it("chiuso, la scheda mostra la parola, le due griglie, i tempi e come è finita ogni Run", async () => {
    const f = await openDuel("crane");
    await play(f, "alice", ["slate", "crane"], 4_000);
    await quit(f, "bob");
    const result = (await cardOf(f, "bob"))!.result!;
    expect(result.word).toBe("crane");
    expect(result.runs.a).toMatchObject({ endReason: "solved", guesses: [{ word: "slate" }, { word: "crane" }] });
    expect(result.runs.a!.timeMs).toBeCloseTo(4_000, -2);
    expect(result.runs.a!.guesses[1].colors).toEqual(["correct", "correct", "correct", "correct", "correct"]);
    expect(result.runs.b).toMatchObject({ endReason: "gaveUp", guesses: [] });
  });

  it("a Duel chiuso la Run non si apre e i tentativi sono respinti", async () => {
    const f = await openDuel("crane");
    await quit(f, "alice");
    await quit(f, "bob");
    await expect(f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId })).rejects.toSatisfy((e) => errorCode(e) === "game_closed");
  });

  it("alla Duel deadline chi non ha finito perde per forfeit, qualunque sia la Run dell'altro", async () => {
    const f = await openDuel("crane");
    await quit(f, "alice");
    await passDeadline(f);
    const card = (await cardOf(f))!;
    expect(card.status).toBe("closed");
    expect(card.result?.outcome).toEqual({ winner: "a", reason: "forfeit" });
    expect(card.result?.runs.b).toBeNull();
  });

  it("se alla deadline nessuno ha finito, il Duel scade senza vincitore", async () => {
    const f = await openDuel("crane");
    await passDeadline(f);
    const card = (await cardOf(f))!;
    expect(card.status).toBe("expired");
    expect(card.result).toBeNull(); // un Duel scaduto non mostra la parola
    expect(JSON.stringify(card)).not.toContain("crane");
  });

  it("una Run in corso alla deadline finisce il suo Run timer, poi il Duel si chiude", async () => {
    const f = await openDuel("crane");
    await play(f, "alice", ["slate", "crane"]);
    vi.advanceTimersByTime(DUEL_DEADLINE_MS - 10_000);
    await f.bob.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    vi.advanceTimersByTime(10_000);
    await f.t.finishInProgressScheduledFunctions();
    expect((await cardOf(f))!.status).toBe("open");

    // Bob gioca ancora dopo la deadline, nel suo Run timer.
    await f.bob.mutation(api.wordleDuels.guess, { duelId: f.duelId, word: "crane" });
    expect((await cardOf(f))!.result?.outcome).toEqual({ winner: "b", reason: "fewerGuesses" });
  });

  it("se la Run in corso alla deadline scade, il Duel si chiude allo scadere", async () => {
    const f = await openDuel("crane");
    vi.advanceTimersByTime(DUEL_DEADLINE_MS - 10_000);
    await f.bob.mutation(api.wordleDuels.openRun, { duelId: f.duelId });
    vi.advanceTimersByTime(10_000);
    await f.t.finishInProgressScheduledFunctions();
    expect((await cardOf(f))!.status).toBe("open");

    vi.advanceTimersByTime(RUN_MS);
    await f.t.finishInProgressScheduledFunctions();
    expect((await cardOf(f))!.result?.outcome).toEqual({ winner: "b", reason: "forfeit" });
  });

  it("dopo la deadline una Run non si apre più", async () => {
    const f = await openDuel("crane");
    vi.advanceTimersByTime(PAST_DEADLINE_MS);
    await expect(f.alice.mutation(api.wordleDuels.openRun, { duelId: f.duelId })).rejects.toSatisfy((e) => errorCode(e) === "game_closed");
  });

  it("i lavori programmati non toccano un Duel già chiuso", async () => {
    const f = await openDuel("crane");
    await play(f, "alice", ["crane"]);
    await play(f, "bob", ["slate", "crane"]);
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    const card = (await cardOf(f))!;
    expect(card.status).toBe("closed");
    expect(card.result?.outcome).toEqual({ winner: "a", reason: "fewerGuesses" });
    expect((await chatMessages(f)).filter((m) => m.authorId === undefined)).toHaveLength(1);
  });
});

describe("messaggio di chiusura", () => {
  it("alla chiusura arriva in chat un messaggio senza autore, non letto per entrambi", async () => {
    const f = await openDuel("crane");
    await play(f, "alice", ["crane"]);
    await play(f, "bob", ["slate", "crane"]);

    const last = (await chatMessages(f)).at(-1)!;
    expect(last).toMatchObject({ kind: "game", wordleDuelId: f.duelId });
    expect(last.authorId).toBeUndefined();

    for (const who of ["alice", "bob"] as const) {
      const chat = (await f[who].query(api.conversations.list, {}))!.find((c) => c._id === f.direct)!;
      expect(chat.unreadCount).toBeGreaterThan(0);
      expect(chat.latest).toMatchObject({
        id: last._id,
        wordleResult: { status: "closed", winnerName: "alice", reason: "fewerGuesses", winnerGuesses: 1, otherGuesses: 2 },
      });
    }
  });

  it("anche un Duel scaduto dopo l'accettazione lo annuncia", async () => {
    const f = await openDuel("crane");
    await passDeadline(f);
    const chat = (await f.bob.query(api.conversations.list, {}))!.find((c) => c._id === f.direct)!;
    expect(chat.latest?.wordleResult).toMatchObject({ status: "expired", winnerName: null, reason: null });
  });
});

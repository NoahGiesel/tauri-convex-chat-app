/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { INVITE_TTL_MS } from "./wordleRules";

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
    await f.bob.mutation(api.wordleDuels.respond, { duelId, action: "accept" });
    vi.advanceTimersByTime(INVITE_TTL_MS);
    await f.t.finishInProgressScheduledFunctions();
    expect((await f.bob.query(api.wordleDuels.get, { duelId }))?.status).toBe("open");
  });
});

describe("scelta della parola", () => {
  it("non ripete una parola già usata nella chat e nella lingua", async () => {
    const f = await twoFriends();
    vi.spyOn(Math, "random").mockReturnValue(0); // senza il filtro uscirebbe sempre la stessa parola
    const words = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const duelId: Id<"wordleDuels"> = await challenge(f);
      words.add(await f.t.run(async (ctx) => (await ctx.db.get("wordleDuels", duelId))!.word));
      await f.alice.mutation(api.wordleDuels.respond, { duelId, action: "withdraw" });
    }
    expect(words.size).toBe(5);
  });
});

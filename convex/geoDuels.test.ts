/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { photoOf, placeById } from "./geoCities";
import { stripJpegMetadata } from "./geoPhoto";
import { DUEL_DEADLINE_MS, INVITE_TTL_MS, MAX_POINTS, ROUND_MS } from "./geoRules";
import schema from "./schema";

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
    return { direct, group, aliceId: alice };
  });
  return {
    t,
    ...ids,
    alice: t.withIdentity({ tokenIdentifier: "test|alice" }),
    bob: t.withIdentity({ tokenIdentifier: "test|bob" }),
    carol: t.withIdentity({ tokenIdentifier: "test|carol" }),
  };
}

type Friends = Awaited<ReturnType<typeof twoFriends>>;
type Player = Friends["alice"];

const errorCode = (e: unknown) => (e as { data?: { code?: string } }).data?.code;

async function challenge(f: Friends, rounds: 3 | 5 = 3) {
  return await f.alice.mutation(api.geoDuels.start, { conversationId: f.direct, zone: "italy", rounds, clue: "name" });
}

async function placesOf(f: Friends, duelId: Id<"geoDuels">) {
  return await f.t.run(async (ctx) => (await ctx.db.get("geoDuels", duelId))!.places);
}

/** Un Duel accettato, con i posti letti dal database per poter cliccare giusto o sbagliato. */
async function openDuel(rounds: 3 | 5 = 3) {
  const f = await twoFriends();
  const duelId = await challenge(f, rounds);
  await f.bob.mutation(api.geoDuels.respond, { duelId, action: "accept" });
  const places = (await placesOf(f, duelId)).map(placeById);
  return { ...f, duelId, places };
}

type Open = Awaited<ReturnType<typeof openDuel>>;

/** Apre il Round `index` e conferma un segnaposto a `offset` gradi di latitudine dal posto. */
async function playRound(f: Open, who: Player, index: number, offset = 0) {
  await who.mutation(api.geoDuels.openRound, { duelId: f.duelId });
  const p = f.places[index];
  await who.mutation(api.geoDuels.guess, { duelId: f.duelId, index, lat: p.lat + offset, lng: p.lng });
}

async function playRun(f: Open, who: Player, offset = 0) {
  for (let i = 0; i < f.places.length; i++) await playRound(f, who, i, offset);
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
    const card = await f.bob.query(api.geoDuels.get, { duelId });
    expect(card).toMatchObject({ status: "invite", mySide: "b", nameA: "alice", nameB: "bob", zone: "italy", rounds: 3 });
    expect(card?.expiresAt).toBe(card!.createdAt + INVITE_TTL_MS);
    expect(await f.t.run((ctx) => ctx.db.query("messages").collect())).toMatchObject([{ kind: "game", geoDuelId: duelId }]);
  });

  it("i posti si scelgono subito, tutti diversi e della Zone, e la scheda non li rivela", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f, 5);
    const places = await placesOf(f, duelId);
    expect(new Set(places).size).toBe(5);
    for (const id of places) expect(placeById(id).country).toBe("IT");
    for (const who of [f.alice, f.bob]) {
      const json = JSON.stringify(await who.query(api.geoDuels.get, { duelId }));
      for (const id of places) expect(json).not.toContain(placeById(id).names.it);
    }
  });

  it("non parte in un gruppo né da chi non è nella chat", async () => {
    const f = await twoFriends();
    await expect(f.alice.mutation(api.geoDuels.start, { conversationId: f.group, zone: "world", rounds: 3, clue: "name" })).rejects.toSatisfy(
      (e) => errorCode(e) === "game_direct_only",
    );
    await expect(f.carol.mutation(api.geoDuels.start, { conversationId: f.direct, zone: "world", rounds: 3, clue: "name" })).rejects.toSatisfy(
      (e) => errorCode(e) === "not_member",
    );
  });

  it("nessuno di fuori vede la scheda", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    expect(await f.carol.query(api.geoDuels.get, { duelId })).toBeNull();
  });

  it("un invito in attesa o un Duel aperto bloccano un altro Geo Duel; uno rifiutato no", async () => {
    const f = await twoFriends();
    const first = await challenge(f);
    await expect(challenge(f)).rejects.toSatisfy((e) => errorCode(e) === "geo_in_progress");
    await f.bob.mutation(api.geoDuels.respond, { duelId: first, action: "decline" });
    const second = await challenge(f);
    await f.bob.mutation(api.geoDuels.respond, { duelId: second, action: "accept" });
    await expect(challenge(f)).rejects.toSatisfy((e) => errorCode(e) === "geo_in_progress");
  });

  it("solo lo sfidato accetta e solo chi sfida ritira", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    await expect(f.alice.mutation(api.geoDuels.respond, { duelId, action: "accept" })).rejects.toSatisfy((e) => errorCode(e) === "not_member");
    await expect(f.bob.mutation(api.geoDuels.respond, { duelId, action: "withdraw" })).rejects.toSatisfy((e) => errorCode(e) === "not_member");
    await f.alice.mutation(api.geoDuels.respond, { duelId, action: "withdraw" });
    expect((await f.bob.query(api.geoDuels.get, { duelId }))?.status).toBe("withdrawn");
  });

  it("dopo 24 ore senza risposta l'invito scade, senza nuovi messaggi", async () => {
    const f = await twoFriends();
    const duelId = await challenge(f);
    vi.advanceTimersByTime(INVITE_TTL_MS);
    await f.t.finishInProgressScheduledFunctions();
    expect((await f.bob.query(api.geoDuels.get, { duelId }))?.status).toBe("expired");
    expect(await f.t.run((ctx) => ctx.db.query("messages").collect())).toHaveLength(1);
  });

  it("i posti dei Duel già giocati nella chat non tornano finché ce ne sono di nuovi", async () => {
    const f = await twoFriends();
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) {
      const duelId = await challenge(f, 5);
      await f.bob.mutation(api.geoDuels.respond, { duelId, action: "accept" });
      for (const id of await placesOf(f, duelId)) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      await f.alice.mutation(api.geoDuels.giveUp, { duelId }).catch(() => {});
      await f.t.run(async (ctx) => ctx.db.patch("geoDuels", duelId, { status: "closed" }));
    }
  });
});

describe("Round", () => {
  it("il nome arriva solo all'apertura del Round, le coordinate solo alla fine", async () => {
    const f = await openDuel();
    expect((await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!.run).toBeNull();

    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    const opened = (await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!;
    expect(opened.run!.rounds).toHaveLength(1);
    expect(opened.run!.rounds[0].place.names?.it).toBe(f.places[0].names.it);
    expect(opened.run!.rounds[0].place).not.toHaveProperty("lat");
    expect(JSON.stringify(opened)).not.toContain(f.places[1].names.it);

    await f.alice.mutation(api.geoDuels.guess, { duelId: f.duelId, index: 0, lat: f.places[0].lat, lng: f.places[0].lng });
    const done = (await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!.run!.rounds[0];
    expect(done.place).toMatchObject({ lat: f.places[0].lat, lng: f.places[0].lng });
    expect(done.result).toMatchObject({ km: 0, points: MAX_POINTS });
  });

  it("i punti calano con la distanza e li calcola il server", async () => {
    const f = await openDuel();
    await playRound(f, f.alice, 0, 1); // un grado di latitudine: circa 111 km
    const r = (await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!.run!.rounds[0].result!;
    expect(r.km).toBeCloseTo(111.2, 0);
    expect(r.points).toBe(Math.round(MAX_POINTS * Math.exp(-r.km! / 150)));
  });

  it("aprire due volte non apre un secondo Round finché il primo è in corso", async () => {
    const f = await openDuel();
    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    expect((await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!.run!.rounds).toHaveLength(1);
  });

  it("un segnaposto per un altro Round o fuori dal mondo è respinto", async () => {
    const f = await openDuel();
    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    await expect(f.alice.mutation(api.geoDuels.guess, { duelId: f.duelId, index: 1, lat: 0, lng: 0 })).rejects.toSatisfy(
      (e) => errorCode(e) === "geo_run_over",
    );
    await expect(f.alice.mutation(api.geoDuels.guess, { duelId: f.duelId, index: 0, lat: 95, lng: 0 })).rejects.toSatisfy(
      (e) => errorCode(e) === "geo_bad_pin",
    );
  });

  it("un segnaposto entro la tolleranza conta, oltre no", async () => {
    const f = await openDuel();
    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    vi.advanceTimersByTime(ROUND_MS + 400);
    await f.alice.mutation(api.geoDuels.guess, { duelId: f.duelId, index: 0, lat: f.places[0].lat, lng: f.places[0].lng });
    const r = (await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!.run!.rounds[0];
    expect(r.result!.points).toBe(MAX_POINTS);
    expect(r.result!.timeMs).toBe(ROUND_MS); // il tempo non supera il Round timer

    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    vi.advanceTimersByTime(ROUND_MS + 600);
    await expect(f.alice.mutation(api.geoDuels.guess, { duelId: f.duelId, index: 1, lat: 0, lng: 0 })).rejects.toSatisfy(
      (e) => errorCode(e) === "geo_run_over",
    );
  });

  it("allo scadere un lavoro programmato chiude il Round con 0 punti, anche a finestra chiusa", async () => {
    const f = await openDuel();
    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    vi.advanceTimersByTime(ROUND_MS + 600);
    await f.t.finishInProgressScheduledFunctions();
    const r = (await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!.run!.rounds[0];
    expect(r.result).toMatchObject({ pin: null, km: null, points: 0 });
    expect(r.place).toHaveProperty("lat");
  });

  it("tra un Round e l'altro il tempo non conta", async () => {
    const f = await openDuel();
    await playRound(f, f.alice, 0);
    vi.advanceTimersByTime(60 * 60 * 1000);
    await f.t.finishInProgressScheduledFunctions();
    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    const run = (await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!.run!;
    expect(run.rounds).toHaveLength(2);
    expect(run.rounds[1].result).toBeNull();
  });

  it("dopo l'ultimo Round la Run è finita e non se ne apre un altro", async () => {
    const f = await openDuel();
    await playRun(f, f.alice);
    const card = (await f.alice.query(api.geoDuels.get, { duelId: f.duelId }))!;
    expect(card.myRun).toMatchObject({ state: "finished", roundsOpened: 3 });
    expect(card.players).toEqual({ a: "finished", b: "toPlay" });
    await expect(f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId })).rejects.toSatisfy((e) => errorCode(e) === "geo_run_over");
  });

  it("la Run dell'altro resta nascosta finché il Duel è aperto", async () => {
    const f = await openDuel();
    await playRun(f, f.alice);
    const bobView = (await f.bob.query(api.geoDuels.myRun, { duelId: f.duelId }))!;
    expect(bobView.result).toBeNull();
    expect(bobView.opponentState).toBe("finished");
    expect(JSON.stringify(await f.bob.query(api.geoDuels.get, { duelId: f.duelId }))).not.toContain(f.places[0].names.it);
  });
});

describe("chiusura", () => {
  it("quando finisce la seconda Run il Duel si chiude: vince chi ha più punti", async () => {
    const f = await openDuel();
    await playRun(f, f.alice, 0);
    await playRun(f, f.bob, 2);
    const card = (await f.bob.query(api.geoDuels.get, { duelId: f.duelId }))!;
    expect(card.status).toBe("closed");
    expect(card.result!.outcome).toEqual({ winner: "a", reason: "morePoints" });
    expect(card.result!.totals.a).toBe(3 * MAX_POINTS);
    expect(card.result!.rounds[0].place.names.it).toBe(f.places[0].names.it);
    expect(card.summary).toMatchObject({ status: "closed", winnerName: "alice", reason: "morePoints", winnerPoints: 3 * MAX_POINTS });

    const closing = await f.t.run((ctx) => ctx.db.query("messages").order("desc").first());
    expect(closing).toMatchObject({ kind: "game", geoDuelId: f.duelId });
    expect(closing?.authorId).toBeUndefined();
    // Ora anche la finestra della Run mostra l'altro giocatore.
    expect((await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!.result!.rounds[0].b).not.toBeNull();
  });

  it("a pari punti vince la Run più veloce, senza contare le pause", async () => {
    const f = await openDuel();
    for (let i = 0; i < 3; i++) {
      await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
      vi.advanceTimersByTime(5_000);
      await f.alice.mutation(api.geoDuels.guess, { duelId: f.duelId, index: i, lat: f.places[i].lat, lng: f.places[i].lng });
      vi.advanceTimersByTime(30_000); // pausa: non conta
    }
    for (let i = 0; i < 3; i++) {
      await f.bob.mutation(api.geoDuels.openRound, { duelId: f.duelId });
      vi.advanceTimersByTime(4_000);
      await f.bob.mutation(api.geoDuels.guess, { duelId: f.duelId, index: i, lat: f.places[i].lat, lng: f.places[i].lng });
    }
    expect((await f.alice.query(api.geoDuels.get, { duelId: f.duelId }))!.result!.outcome).toEqual({ winner: "b", reason: "fasterRun" });
  });

  it("arrendersi chiude la Run: i Round non giocati valgono 0", async () => {
    const f = await openDuel();
    await playRound(f, f.alice, 0);
    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    await f.alice.mutation(api.geoDuels.giveUp, { duelId: f.duelId });
    await playRun(f, f.bob, 0.5);
    const card = (await f.alice.query(api.geoDuels.get, { duelId: f.duelId }))!;
    expect(card.result!.totals.a).toBe(MAX_POINTS);
    expect(card.result!.rounds[1].a).toMatchObject({ points: 0 });
    expect(card.result!.rounds[2].a).toBeNull();
  });

  it("alla Duel deadline chi non ha aperto la Run perde per forfeit", async () => {
    const f = await openDuel();
    await playRound(f, f.alice, 0, 3); // solo il primo Round, e lontano
    vi.advanceTimersByTime(DUEL_DEADLINE_MS + 1_000);
    await f.t.finishInProgressScheduledFunctions();
    const card = (await f.bob.query(api.geoDuels.get, { duelId: f.duelId }))!;
    expect(card.status).toBe("closed");
    expect(card.result!.outcome).toEqual({ winner: "a", reason: "forfeit" });
    await expect(f.bob.mutation(api.geoDuels.openRound, { duelId: f.duelId })).rejects.toSatisfy((e) => errorCode(e) === "game_closed");
  });

  it("alla Duel deadline un Round in corso finisce prima il suo timer, poi il Duel si chiude", async () => {
    const f = await openDuel();
    await playRun(f, f.bob);
    vi.advanceTimersByTime(DUEL_DEADLINE_MS - 10_000);
    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    vi.advanceTimersByTime(10_000);
    await f.t.finishInProgressScheduledFunctions();
    expect((await f.alice.query(api.geoDuels.get, { duelId: f.duelId }))!.status).toBe("open");

    await f.alice.mutation(api.geoDuels.guess, { duelId: f.duelId, index: 0, lat: f.places[0].lat, lng: f.places[0].lng });
    const card = (await f.alice.query(api.geoDuels.get, { duelId: f.duelId }))!;
    expect(card.status).toBe("closed");
    expect(card.result!.totals).toEqual({ a: MAX_POINTS, b: 3 * MAX_POINTS });
    expect(card.result!.outcome).toEqual({ winner: "b", reason: "morePoints" });
  });

  it("se nessuno gioca il Duel scade senza esito, con il messaggio di chiusura", async () => {
    const f = await openDuel();
    vi.advanceTimersByTime(DUEL_DEADLINE_MS + 1_000);
    await f.t.finishInProgressScheduledFunctions();
    const card = (await f.alice.query(api.geoDuels.get, { duelId: f.duelId }))!;
    expect(card.status).toBe("expired");
    expect(card.summary).toMatchObject({ status: "expired", winnerName: null });
  });
});

describe("rivincita e statistiche", () => {
  it("la rivincita si offre solo sull'ultimo Duel chiuso e mai con un Duel aperto", async () => {
    const f = await openDuel();
    await playRun(f, f.alice);
    await playRun(f, f.bob, 1);
    expect((await f.bob.query(api.geoDuels.get, { duelId: f.duelId }))!.canRematch).toBe(true);
    const next = await f.bob.mutation(api.geoDuels.start, { conversationId: f.direct, zone: "italy", rounds: 3, clue: "name" });
    expect((await f.bob.query(api.geoDuels.get, { duelId: f.duelId }))!.canRematch).toBe(false);
    expect(await placesOf(f, next)).not.toEqual(f.places.map((p) => p.id));
  });

  it("la storia conta vittorie e media dei punti per Round", async () => {
    const f = await openDuel();
    await playRun(f, f.alice);
    await playRun(f, f.bob, 1);
    const history = (await f.alice.query(api.geoDuels.history, { conversationId: f.direct }))!;
    expect(history.total).toBe(1);
    const alice = history.players.find((p) => p.name === "alice")!;
    expect(alice).toMatchObject({ wins: 1, averagePoints: MAX_POINTS });
    expect(history.recent[0]).toMatchObject({ pointsA: 3 * MAX_POINTS, zone: "italy", rounds: 3, winnerSide: "a" });
  });
});

describe("foto", () => {
  async function photoDuel() {
    const f = await twoFriends();
    const duelId = await f.alice.mutation(api.geoDuels.start, { conversationId: f.direct, zone: "europe", rounds: 3, clue: "photo" });
    await f.bob.mutation(api.geoDuels.respond, { duelId, action: "accept" });
    const places = (await placesOf(f, duelId)).map(placeById);
    return { ...f, duelId, places };
  }

  it("pesca solo posti con una foto", async () => {
    const f = await photoDuel();
    for (const p of f.places) expect(photoOf(p.id)).not.toBeNull();
    expect((await f.alice.query(api.geoDuels.get, { duelId: f.duelId }))?.clue).toBe("photo");
  });

  it("durante il Round arriva solo la foto, senza nome, paese, file né coordinate", async () => {
    const f = await photoDuel();
    await f.alice.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    const run = (await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!;
    const place = run.run!.rounds[0].place;
    expect(place.names).toBeNull();
    expect(place).not.toHaveProperty("country");
    expect(place).not.toHaveProperty("lat");
    expect(place.photo?.path).toMatch(/^\/geo\/photo\?/);
    const json = JSON.stringify(run);
    expect(json).not.toContain(f.places[0].names.en);
    expect(json).not.toContain(photoOf(f.places[0].id)!.file);

    await f.alice.mutation(api.geoDuels.guess, { duelId: f.duelId, index: 0, lat: f.places[0].lat, lng: f.places[0].lng });
    const ended = (await f.alice.query(api.geoDuels.myRun, { duelId: f.duelId }))!.run!.rounds[0].place;
    expect(ended.names?.en).toBe(f.places[0].names.en);
    expect(ended).toMatchObject({ country: f.places[0].country, lat: f.places[0].lat });
  });

  it("la foto si apre solo con la chiave giusta e dopo che il Round è stato aperto", async () => {
    const f = await photoDuel();
    const keys = await f.t.run(async (ctx) => (await ctx.db.get("geoDuels", f.duelId))!.photoKeys!);
    const file = (index: number, key: string) => f.t.query(internal.geoDuels.photoFile, { duelId: f.duelId, index, key });

    expect(await file(0, keys[0])).toBeNull(); // nessuno ha ancora aperto il Round
    await f.bob.mutation(api.geoDuels.openRound, { duelId: f.duelId });
    expect(await file(0, keys[0])).toBe(photoOf(f.places[0].id)!.file);
    expect(await file(0, keys[1])).toBeNull();
    expect(await file(1, keys[1])).toBeNull();
    expect(await f.t.query(internal.geoDuels.photoFile, { duelId: "nonsense", index: 0, key: keys[0] })).toBeNull();
  });
});

describe("metadati delle foto", () => {
  it("toglie i blocchi EXIF e XMP da un JPEG e lascia il resto", () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x01, 0x02, 0xff, 0xe1, 0x00, 0x05, 0x47, 0x50, 0x53, 0xff, 0xda, 0x00, 0x02, 0x99, 0xff, 0xd9]);
    expect([...stripJpegMetadata(jpeg)]).toEqual([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x01, 0x02, 0xff, 0xda, 0x00, 0x02, 0x99, 0xff, 0xd9]);
  });

  it("lascia com'è un file che non è un JPEG", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    expect(stripJpegMetadata(png)).toBe(png);
  });
});

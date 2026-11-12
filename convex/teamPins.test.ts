/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { espnFetchStub, loadFixture } from "./espnStub.test-helper";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** Alice e Bob con una chat diretta; Carol con loro in un gruppo, e in una chat diretta con Alice. L'indice è già costruito. */
async function twoFriends() {
  const t = convexTest(schema, modules);
  await t.action(internal.footballTeams.rebuildIndex, {});
  const ids = await t.run(async (ctx) => {
    const profile = (name: string) =>
      ctx.db.insert("profiles", { tokenIdentifier: `test|${name}`, name, email: `${name}@example.com`, avatarIndex: 0 });
    const alice = await profile("alice");
    const bob = await profile("bob");
    const carol = await profile("carol");
    const then = Date.now() - 60_000;
    const direct = await ctx.db.insert("conversations", { kind: "direct", createdBy: alice, directKey: `${alice}_${bob}`, lastMessageAt: then });
    const other = await ctx.db.insert("conversations", { kind: "direct", createdBy: alice, directKey: `${alice}_${carol}`, lastMessageAt: then });
    const group = await ctx.db.insert("conversations", { kind: "group", name: "Weekend", createdBy: alice, lastMessageAt: then });
    for (const [conversationId, profileId] of [
      [direct, alice],
      [direct, bob],
      [other, alice],
      [other, carol],
      [group, alice],
      [group, bob],
      [group, carol],
    ] as const) {
      await ctx.db.insert("members", { conversationId, profileId, lastReadAt: then, lastMessageAt: then });
    }
    return { direct, other, group, then };
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

const errorCode = (e: unknown) => (e as { data?: { code?: string } }).data?.code;
const refused = (code: string) => (e: unknown) => errorCode(e) === code;

const standingsPath = (league: string) => `/v2/sports/soccer/${league}/standings`;
const INTER = "110";
const MILAN = "103";
const JUVENTUS = "111";
const NAPOLI = "114";
const VENEZIA = "17530";
const TURKEY = "465";
/** Türkiye-Belgio (uefa.nations), calcio d'inizio alle 17:00 UTC del 12 novembre 2026. */
const TUR_BEL = "401861145";
/** Fiorentina-Juventus (ita.1), calcio d'inizio alle 19:45 UTC. */
const FIO_JUV = "401875003";

/** La risposta vera di `/all/teams/{id}` mentre la squadra gioca: `nextEvent` è già la partita dopo. */
function teamPlayingNext(teamId: string, opponent: { id: string; name: string; abbreviation: string }) {
  const team = (id: string, name: string, abbreviation: string) => ({ id, displayName: name, shortDisplayName: name, abbreviation });
  return {
    team: {
      ...team(teamId, "Juventus", "JUV"),
      nextEvent: [
        {
          id: "401875099",
          date: "2026-11-22T11:30Z",
          league: { slug: "ita.1" },
          competitions: [
            {
              status: { displayClock: "0'", type: { state: "pre", name: "STATUS_SCHEDULED" } },
              competitors: [
                { homeAway: "home", team: team(JUVENTUS, "Juventus", "JUV") },
                { homeAway: "away", team: team(opponent.id, opponent.name, opponent.abbreviation) },
              ],
            },
          ],
        },
      ],
    },
  };
}

/** Il calendario ESPN (`schedule?fixture=true`) di un club con le partite di un tabellone, nella stagione 2026-27. */
function scheduleOf(teamId: string, league: string, events: any[]) {
  const season = { year: 2026, displayName: "2026-27 Italian Serie A" };
  return {
    season,
    team: { id: teamId, isNational: false },
    events: events.map((e) => ({
      ...e,
      season,
      seasonType: { name: season.displayName },
      league: { slug: league, name: "Italian Serie A", abbreviation: "Serie A" },
    })),
  };
}

const systemLines = (f: Friends, conversationId: Id<"conversations">) =>
  f.t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("by_conversation_and_kind", (q) => q.eq("conversationId", conversationId).eq("kind", "system"))
      .collect(),
  );

let stub: ReturnType<typeof espnFetchStub>;
beforeEach(() => {
  vi.useFakeTimers();
  // Dopo la partita registrata nei fixture (Como-Inter, in corso alle 17:50), così non risulta più in corso.
  vi.setSystemTime(Date.parse("2026-11-09T00:30Z"));
  stub = espnFetchStub();
  vi.stubGlobal("fetch", stub.fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("aggiungere una squadra", () => {
  it("la pinna nella chat, con una riga di sistema silenziosa", async () => {
    const f = await twoFriends();
    await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });

    for (const who of [f.alice, f.bob]) {
      expect(await who.query(api.teamPins.list, { conversationId: f.direct })).toMatchObject([
        { team: { teamId: INTER, name: "Internazionale", abbreviation: "INT" } },
      ]);
    }
    const lines = await systemLines(f, f.direct);
    expect(lines).toHaveLength(1);
    expect(lines[0].system).toMatchObject({ action: "pinned", teamName: "Internazionale" });

    // Silenziosa: la chat non sale nell'elenco e Bob non ha messaggi da leggere.
    const conversation = await f.t.run((ctx) => ctx.db.get("conversations", f.direct));
    expect(conversation?.lastMessageAt).toBe(f.then);
    const bobsChats = await f.bob.query(api.conversations.list, {});
    expect(bobsChats?.find((c) => c._id === f.direct)).toMatchObject({ unreadCount: 0, latest: null });
  });

  it("cerca la prossima partita della squadra", async () => {
    const f = await twoFriends();
    await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    const [pin] = await f.alice.query(api.teamPins.list, { conversationId: f.direct });
    expect(pin.nextMatch).toMatchObject({
      kickoff: Date.parse("2026-11-22T19:45Z"),
      state: "pre",
      home: { teamId: "105", abbreviation: "ATA" },
      away: { teamId: INTER, abbreviation: "INT" },
    });
    expect(stub.calls.filter((c) => c === "/site/v2/sports/soccer/all/teams/110")).toHaveLength(1);
  });

  it("messo mentre la squadra gioca, mostra la partita in corso", async () => {
    vi.setSystemTime(Date.parse("2026-11-08T20:15Z"));
    const f = await twoFriends();
    const board = loadFixture("scoreboard-ita.1-today");
    const event = board.events.find((e: { id: string }) => e.id === FIO_JUV);
    for (const status of [event.status, event.competitions[0].status]) {
      status.type.state = "in";
      status.type.name = "STATUS_SECOND_HALF";
      status.displayClock = "60'";
    }
    const [fiorentina, juventus] = event.competitions[0].competitors;
    fiorentina.score = "1";
    juventus.score = "0";
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", board);
    // Mentre si gioca, ESPN dà già come prossima la partita dopo.
    stub.reply("/site/v2/sports/soccer/all/teams/111", teamPlayingNext(JUVENTUS, { id: VENEZIA, name: "Venezia", abbreviation: "VEN" }));
    // Il calendario della squadra dà la partita in corso con la sua competizione.
    stub.reply("/site/v2/sports/soccer/all/teams/111/schedule?fixture=true", scheduleOf(JUVENTUS, "ita.1", [event]));

    await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: JUVENTUS });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    const [pin] = await f.alice.query(api.teamPins.list, { conversationId: f.direct });
    expect(pin.nextMatch).toMatchObject({
      eventId: FIO_JUV,
      state: "in",
      score: { home: 1, away: 0 },
      home: { teamId: "109", abbreviation: "FIO" },
      away: { teamId: JUVENTUS, abbreviation: "JUV" },
    });
  });

  it("una nazionale messa mentre gioca fuori dalle amichevoli mostra la partita in corso", async () => {
    // Türkiye-Belgio di Nations League, in corso all'82' (risposte ESPN vere del 12 novembre 2026).
    vi.setSystemTime(Date.parse("2026-11-12T18:40Z"));
    const f = await twoFriends();
    stub.reply("/site/v2/sports/soccer/uefa.nations/scoreboard", loadFixture("scoreboard-uefa.nations-live"));

    await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: TURKEY });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    const [pin] = await f.alice.query(api.teamPins.list, { conversationId: f.direct });
    expect(pin.nextMatch).toMatchObject({
      eventId: TUR_BEL,
      league: "uefa.nations",
      state: "in",
      score: { home: 1, away: 2 },
      home: { teamId: TURKEY, abbreviation: "TUR" },
      away: { teamId: "459", abbreviation: "BEL" },
    });
  });

  it("senza partite in programma la squadra resta pinnata senza prossima partita", async () => {
    const f = await twoFriends();
    const inter = loadFixture("team-110");
    inter.team.nextEvent = [];
    stub.reply("/site/v2/sports/soccer/all/teams/110", inter);
    await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await f.alice.query(api.teamPins.list, { conversationId: f.direct })).toMatchObject([{ nextMatch: null }]);
  });
});

describe("rifiuti", () => {
  it("non in un gruppo", async () => {
    const f = await twoFriends();
    await expect(f.alice.mutation(api.teamPins.add, { conversationId: f.group, teamId: INTER })).rejects.toSatisfy(refused("team_pins_direct_only"));
  });

  it("non più di 3 squadre per chat", async () => {
    const f = await twoFriends();
    for (const teamId of [INTER, MILAN, JUVENTUS]) await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId });
    await expect(f.bob.mutation(api.teamPins.add, { conversationId: f.direct, teamId: NAPOLI })).rejects.toSatisfy(refused("too_many_team_pins"));
    expect(await f.alice.query(api.teamPins.list, { conversationId: f.direct })).toHaveLength(3);
  });

  it("non la stessa squadra due volte", async () => {
    const f = await twoFriends();
    await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });
    await expect(f.bob.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER })).rejects.toSatisfy(refused("team_already_pinned"));
  });

  it("non una squadra fuori dall'indice", async () => {
    const f = await twoFriends();
    await expect(f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: "999999" })).rejects.toSatisfy(refused("unknown_team"));
  });

  it("chi non è nella chat non aggiunge, non toglie e non vede", async () => {
    const f = await twoFriends();
    const pinId = await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });

    await expect(f.carol.mutation(api.teamPins.add, { conversationId: f.direct, teamId: MILAN })).rejects.toSatisfy(refused("not_member"));
    await expect(f.carol.mutation(api.teamPins.remove, { pinId })).rejects.toSatisfy(refused("not_member"));
    expect(await f.carol.query(api.teamPins.list, { conversationId: f.direct })).toEqual([]);
    expect(await f.alice.query(api.teamPins.list, { conversationId: f.direct })).toHaveLength(1);
  });
});

describe("togliere una squadra", () => {
  it("può farlo chiunque dei due, con una riga di sistema", async () => {
    const f = await twoFriends();
    const inter = await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });
    const milan = await f.bob.mutation(api.teamPins.add, { conversationId: f.direct, teamId: MILAN });

    await f.bob.mutation(api.teamPins.remove, { pinId: inter });
    await f.alice.mutation(api.teamPins.remove, { pinId: milan });

    expect(await f.alice.query(api.teamPins.list, { conversationId: f.direct })).toEqual([]);
    const lines = await systemLines(f, f.direct);
    expect(lines.map((l) => l.system?.action)).toEqual(["pinned", "pinned", "unpinned", "unpinned"]);
    expect(lines[2].system).toMatchObject({ teamName: "Internazionale" });
  });

  it("una squadra tolta si può pinnare di nuovo", async () => {
    const f = await twoFriends();
    const pinId = await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });
    await f.alice.mutation(api.teamPins.remove, { pinId });
    await f.bob.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });
    expect(await f.alice.query(api.teamPins.list, { conversationId: f.direct })).toHaveLength(1);
  });
});

describe("aggiornamento ogni 6 ore", () => {
  it("vede un calcio d'inizio spostato, con una sola richiesta per squadra", async () => {
    const f = await twoFriends();
    await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });
    await f.alice.mutation(api.teamPins.add, { conversationId: f.other, teamId: INTER });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    const moved = loadFixture("team-110");
    moved.team.nextEvent[0].date = "2026-11-23T17:00Z";
    stub.reply("/site/v2/sports/soccer/all/teams/110", moved);
    const before = stub.calls.length;
    await f.t.mutation(internal.footballMatches.refreshPinnedTeams, {});
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(stub.calls.slice(before).sort()).toEqual([
      "/site/v2/sports/soccer/all/teams/110",
      "/site/v2/sports/soccer/all/teams/110/schedule",
      "/site/v2/sports/soccer/all/teams/110/schedule?fixture=true",
      standingsPath("ita.1"),
      standingsPath("ita.coppa_italia"),
      standingsPath("ita.super_cup"),
      standingsPath("uefa.champions"),
    ]);
    for (const conversationId of [f.direct, f.other]) {
      const [pin] = await f.alice.query(api.teamPins.list, { conversationId });
      expect(pin.nextMatch?.kickoff).toBe(Date.parse("2026-11-23T17:00Z"));
    }
    const matches = await f.t.run((ctx) => ctx.db.query("footballMatches").collect());
    expect(matches).toHaveLength(1);
  });

  it("se ESPN non risponde la prossima partita resta com'era", async () => {
    const f = await twoFriends();
    await f.alice.mutation(api.teamPins.add, { conversationId: f.direct, teamId: INTER });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    stub.reply("/site/v2/sports/soccer/all/teams/110", "down", 503);
    await f.t.mutation(internal.footballMatches.refreshPinnedTeams, {});
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    const [pin] = await f.alice.query(api.teamPins.list, { conversationId: f.direct });
    expect(pin.nextMatch?.kickoff).toBe(Date.parse("2026-11-22T19:45Z"));
  });
});

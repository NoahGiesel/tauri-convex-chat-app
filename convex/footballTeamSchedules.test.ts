/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseScoreboard, parseSchedule } from "./espn";
import { espnFetchStub, loadFixture } from "./espnStub.test-helper";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const INTER = "110";
const ATALANTA = "105";
const COMO = "2572";
const JUVENTUS = "111";
const ITALY = "162";
/** Como-Inter (ita.1), all'intervallo nel tabellone registrato. */
const COMO_INTER = "401874808";

const AT_HALFTIME = Date.parse("2026-11-08T17:50Z");
const TEN_MINUTES = 10 * 60_000;

const schedulePath = (teamId: string, fixture = false) =>
  `/site/v2/sports/soccer/all/teams/${teamId}/schedule${fixture ? "?fixture=true" : ""}`;

/** Una chat diretta di alice per ogni gruppo di squadre; l'ultima è una chat di alice senza pin. */
async function setup(chats: string[][]) {
  const t = convexTest(schema, modules);
  await t.action(internal.footballTeams.rebuildIndex, {});
  const ids = await t.run(async (ctx) => {
    const alice = await ctx.db.insert("profiles", { tokenIdentifier: "test|alice", name: "alice", email: "alice@example.com", avatarIndex: 0 });
    const conversations: Id<"conversations">[] = [];
    for (const [i, teams] of [...chats, []].entries()) {
      const friend = await ctx.db.insert("profiles", { tokenIdentifier: `test|f${i}`, name: `f${i}`, email: `f${i}@example.com`, avatarIndex: 0 });
      const conversationId = await ctx.db.insert("conversations", { kind: "direct", createdBy: alice, directKey: `${alice}_${friend}`, lastMessageAt: 0 });
      for (const profileId of [alice, friend]) await ctx.db.insert("members", { conversationId, profileId, lastReadAt: 0, lastMessageAt: 0 });
      for (const teamId of teams) await ctx.db.insert("teamPins", { conversationId, teamId, pinnedBy: alice, pinnedAt: 0 });
      conversations.push(conversationId);
    }
    // Una conoscente di alice che non è in nessuna delle chat qui sopra.
    await ctx.db.insert("profiles", { tokenIdentifier: "test|carol", name: "carol", email: "carol@example.com", avatarIndex: 0 });
    return { alice, conversations, emptyChat: conversations[conversations.length - 1] };
  });
  return {
    t,
    ...ids,
    alice: t.withIdentity({ tokenIdentifier: "test|alice" }),
    bob: t.withIdentity({ tokenIdentifier: "test|f0" }),
    carol: t.withIdentity({ tokenIdentifier: "test|carol" }),
  };
}

type T = Awaited<ReturnType<typeof setup>>["t"];

const scheduleRow = (t: T, teamId: string) =>
  t.run((ctx) =>
    ctx.db
      .query("footballTeamSchedules")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .unique(),
  );

let stub: ReturnType<typeof espnFetchStub>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AT_HALFTIME);
  stub = espnFetchStub();
  vi.stubGlobal("fetch", stub.fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lettura del calendario", () => {
  it("i risultati diventano righe leggere, con l'avversario e il lato", () => {
    const { matches } = parseSchedule(loadFixture("schedule-110-results"), INTER);
    expect(matches).toHaveLength(21);
    expect(matches[0]).toEqual({
      eventId: COMO_INTER,
      kickoff: Date.parse("2026-11-08T17:00Z"),
      league: "ita.1",
      leagueName: "Serie A",
      round: "2026-27 Italian Serie A",
      opponent: { teamId: COMO, name: "Como", shortName: "Como", abbreviation: "COMO", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/2572.png" },
      home: true,
      score: { home: 2, away: 0 },
      state: "post",
    });

    const away = matches.find((m) => m.eventId === "401915307")!;
    expect(away).toMatchObject({ league: "uefa.champions", home: false, opponent: { teamId: "142" }, score: { home: 0, away: 3 } });
  });

  it("le partite in programma sono righe senza punteggio, in ordine di data", () => {
    const { matches } = parseSchedule(loadFixture("schedule-110-fixtures"), INTER);
    expect(matches).toHaveLength(33);
    expect(matches[0]).toMatchObject({
      eventId: "401875001",
      kickoff: Date.parse("2026-11-22T19:45Z"),
      league: "ita.1",
      home: false,
      opponent: { teamId: ATALANTA, name: "Atalanta" },
      state: "pre",
    });
    expect(matches[0].score).toBeUndefined();
  });

  it("il punteggio dei rigori si legge da score.shootoutScore", () => {
    const { matches } = parseSchedule(loadFixture("schedule-110-results"), INTER);
    const shootout = matches.find((m) => m.eventId === "401871493")!;
    expect(shootout).toMatchObject({ score: { home: 1, away: 1 }, shootout: { home: 1, away: 3 }, home: false });

    const italy = parseSchedule(loadFixture("schedule-162-results"), ITALY).matches.find((m) => m.eventId === "761952")!;
    expect(italy).toMatchObject({ score: { home: 1, away: 1 }, shootout: { home: 4, away: 1 }, home: false });
  });

  it("le competizioni sono gli slug di risultati e partite, senza le amichevoli", () => {
    const results = parseSchedule(loadFixture("schedule-110-results"), INTER);
    const fixtures = parseSchedule(loadFixture("schedule-110-fixtures"), INTER);
    const competitions = mergeCompetitions(results.competitions, fixtures.competitions);
    expect(competitions.map((c) => c.league).sort()).toEqual(["ita.1", "ita.coppa_italia", "ita.super_cup", "uefa.champions"]);
    expect(competitions.find((c) => c.league === "ita.1")).toEqual({
      league: "ita.1",
      name: "Italian Serie A",
      shortName: "Serie A",
      season: "2026-27 Italian Serie A",
    });
  });

  it("una nazionale tiene solo le competizioni della stagione in corso", () => {
    const { competitions, matches } = parseSchedule(loadFixture("schedule-162-results"), ITALY);
    expect(competitions.map((c) => c.league)).toEqual(["uefa.nations"]);
    expect(matches).toHaveLength(25); // i risultati restano tutti
  });

  it("un calendario senza la squadra chiesta non vale", () => {
    const raw = loadFixture("schedule-110-results") as { events: { competitions: { competitors: { team: { id: string } }[] }[] }[] };
    for (const event of raw.events) for (const competitor of event.competitions[0].competitors) competitor.team.id = "999";
    expect(() => parseSchedule(raw, INTER)).toThrow(/ESPN/);
  });
});

/** Le competizioni di due liste, senza doppioni e nell'ordine in cui compaiono. */
function mergeCompetitions(...lists: { league: string; name: string; shortName: string; season: string }[][]) {
  const byLeague = new Map<string, { league: string; name: string; shortName: string; season: string }>();
  for (const competition of lists.flat()) if (!byLeague.has(competition.league)) byLeague.set(competition.league, competition);
  return [...byLeague.values()];
}

describe("aggiornamento del calendario", () => {
  it("pinnare una squadra ne scarica risultati, partite e competizioni", async () => {
    const f = await setup([[]]);
    await f.alice.mutation(api.teamPins.add, { conversationId: f.conversations[0], teamId: INTER });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    const row = await scheduleRow(f.t, INTER);
    expect(row).toMatchObject({ teamId: INTER });
    expect(row!.fetchedAt).toBeGreaterThanOrEqual(AT_HALFTIME);
    expect(row!.fetchedAt).toBeLessThan(AT_HALFTIME + 1000);
    expect(row?.results).toHaveLength(21);
    expect(row?.fixtures).toHaveLength(33);
    expect(row?.competitions.map((c) => c.league).sort()).toEqual(["ita.1", "ita.coppa_italia", "ita.super_cup", "uefa.champions"]);
    expect(stub.calls).toContain(schedulePath(INTER));
    expect(stub.calls).toContain(schedulePath(INTER, true));
  });

  it("alla fine di una partita il calendario si rifà dieci minuti dopo", async () => {
    const f = await setup([[INTER]]);
    await f.t.run(async (ctx) => {
      const match = parseScoreboard(loadFixture("scoreboard-ita.1-today"), "ita.1").find((m) => m.eventId === COMO_INTER)!;
      const matchId = await ctx.db.insert("footballMatches", { ...match, fetchedAt: AT_HALFTIME - 30_000 });
      const inter = await ctx.db.query("footballTeams").withIndex("by_teamId", (q) => q.eq("teamId", INTER)).unique();
      await ctx.db.patch("footballTeams", inter!._id, { nextMatchId: matchId });
      await ctx.db.insert("footballTeamSchedules", {
        teamId: INTER,
        results: [],
        fixtures: [],
        competitions: [],
        fetchedAt: AT_HALFTIME - 60_000,
      });
    });

    const board = loadFixture("scoreboard-ita.1-today");
    const event = board.events.find((e: { id: string }) => e.id === COMO_INTER);
    for (const status of [event.status, event.competitions[0].status]) Object.assign(status.type, { state: "post", name: "STATUS_FULL_TIME" });
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", board);

    await f.t.mutation(internal.footballMatches.tick, {});
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    const row = await scheduleRow(f.t, INTER);
    expect(row!.fetchedAt).toBeGreaterThanOrEqual(AT_HALFTIME + TEN_MINUTES);
    expect(row?.results).toHaveLength(21);
  });

  it("il cron delle 6 ore scarica il calendario una volta per squadra, anche con due chat", async () => {
    const f = await setup([[INTER], [INTER]]);
    await f.t.mutation(internal.footballMatches.refreshPinnedTeams, {});
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(stub.calls.filter((c) => c === schedulePath(INTER))).toHaveLength(1);
    expect(stub.calls.filter((c) => c === schedulePath(INTER, true))).toHaveLength(1);
    expect((await scheduleRow(f.t, INTER))?.results).toHaveLength(21);
  });

  it("una richiesta fallita non tocca la riga e finisce nei log", async () => {
    const f = await setup([[INTER]]);
    const before = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("footballTeamSchedules", {
        teamId: INTER,
        results: [],
        fixtures: [],
        competitions: [{ league: "ita.1", name: "Italian Serie A", shortName: "Serie A", season: "2026-27 Italian Serie A" }],
        fetchedAt: AT_HALFTIME - 60_000,
      });
      return (await ctx.db.get("footballTeamSchedules", id))!;
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stub.reply(schedulePath(INTER), "down", 503);

    await f.t.action(internal.footballTeamSchedules.refresh, { teamId: INTER });

    expect(await scheduleRow(f.t, INTER)).toEqual(before);
    expect(logged).toHaveBeenCalledWith(`Calendario di ${INTER}:`, expect.stringContaining("503"));
  });

  it("la pulizia di ogni giorno toglie il calendario di una squadra che nessuna chat pinna", async () => {
    const f = await setup([[INTER]]);
    await f.t.run(async (ctx) => {
      for (const teamId of [INTER, JUVENTUS]) {
        await ctx.db.insert("footballTeamSchedules", { teamId, results: [], fixtures: [], competitions: [], fetchedAt: AT_HALFTIME });
      }
    });

    await f.t.mutation(internal.footballMatches.cleanup, {});

    const rows = await f.t.run((ctx) => ctx.db.query("footballTeamSchedules").collect());
    expect(rows.map((r) => r.teamId)).toEqual([INTER]);
  });
});

describe("calendario nel drawer", () => {
  async function withRow(f: Awaited<ReturnType<typeof setup>>) {
    await f.t.run(async (ctx) => {
      const results = parseSchedule(loadFixture("schedule-110-results"), INTER);
      const fixtures = parseSchedule(loadFixture("schedule-110-fixtures"), INTER);
      await ctx.db.insert("footballTeamSchedules", {
        teamId: INTER,
        results: results.matches,
        fixtures: fixtures.matches,
        competitions: mergeCompetitions(results.competitions, fixtures.competitions),
        fetchedAt: AT_HALFTIME,
      });
    });
  }

  it("restituisce il calendario a chi è nella chat che pinna la squadra", async () => {
    const f = await setup([[INTER], []]);
    await withRow(f);
    const view = await f.alice.query(api.footballTeamSchedules.forPin, { conversationId: f.conversations[0], teamId: INTER });
    expect(view).toMatchObject({ teamId: INTER, fetchedAt: AT_HALFTIME });
    expect(view?.results).toHaveLength(21);
    expect(view?.fixtures).toHaveLength(33);
    expect(view?.competitions).toHaveLength(4);
    // Anche l'altra persona della chat lo vede.
    expect(await f.bob.query(api.footballTeamSchedules.forPin, { conversationId: f.conversations[0], teamId: INTER })).not.toBeNull();
  });

  it("non lo restituisce a chi non è nella chat, a una chat che non pinna la squadra, o senza calendario", async () => {
    const f = await setup([[INTER], []]);
    await withRow(f);
    expect(await f.alice.query(api.footballTeamSchedules.forPin, { conversationId: f.emptyChat, teamId: INTER })).toBeNull();
    expect(await f.carol.query(api.footballTeamSchedules.forPin, { conversationId: f.conversations[0], teamId: INTER })).toBeNull();
    expect(await f.t.query(api.footballTeamSchedules.forPin, { conversationId: f.conversations[0], teamId: INTER })).toBeNull();
    expect(await f.alice.query(api.footballTeamSchedules.forPin, { conversationId: f.conversations[0], teamId: JUVENTUS })).toBeNull();
  });
});

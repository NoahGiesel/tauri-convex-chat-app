/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseScoreboard, parseStandings } from "./espn";
import { espnFetchStub, loadFixture } from "./espnStub.test-helper";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const INTER = "110";
const MILAN = "103";
const JUVENTUS = "111";
const ITALY = "162";
/** Como-Inter (ita.1), all'intervallo nel tabellone registrato. */
const COMO_INTER = "401874808";

const AT_HALFTIME = Date.parse("2026-11-08T17:50Z");
const TEN_MINUTES = 10 * 60_000;

const standingsPath = (league: string) => `/v2/sports/soccer/${league}/standings`;

/** La classifica di una competizione, come la scrive `parseStandings`. */
function standingsOf(league: string) {
  return parseStandings(loadFixture(`standings-${league}`));
}

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

const standingsRow = async (t: T, league: string) =>
  (await t.run((ctx) => ctx.db.query("footballStandings").collect())).filter((row) => row.league === league);

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

describe("lettura della classifica", () => {
  it("legge la stagione, la fine stagione, il girone e la riga di ogni squadra", () => {
    const standings = parseStandings(loadFixture("standings-ita.1"));

    expect(standings.season).toBe("2026-27 Italian Serie A");
    expect(standings.endDate).toBe(Date.parse("2027-07-01T03:59Z"));
    expect(standings.groups).toHaveLength(1);
    expect(standings.groups[0].name).toBe("2026-2027 Italian Serie A");
    expect(standings.groups[0].rows).toHaveLength(20);

    expect(standings.groups[0].rows[1]).toEqual({
      rank: 2,
      teamId: "110",
      name: "Internazionale",
      shortName: "Inter Milan",
      logo: "https://a.espncdn.com/i/teamlogos/soccer/500/110.png",
      played: 11,
      goalDifference: 15,
      points: 28,
      zone: { color: "81D6AC", label: "Champions League" },
    });
  });

  it("ordina le righe di un girone per posizione: ESPN le manda per id", () => {
    const standings = parseStandings(loadFixture("standings-uefa.nations"));
    const group = standings.groups.find((g) => g.name === "Group A1")!;

    expect(group.rows.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
    expect(group.rows.map((row) => row.teamId)).toEqual(["478", "162", "459", "465"]);
  });

  it("pulisce la zona: toglie i cancelletti di troppo e gli spazi attorno", () => {
    const raw = loadFixture("standings-ita.1");
    raw.children[0].standings.entries[0].note = { color: " ##81D6AC\t", description: " Champions League\t" };

    const row = parseStandings(raw).groups[0].rows[0];
    expect(row.zone).toEqual({ color: "81D6AC", label: "Champions League" });
  });

  it("una coppa senza tabella è una risposta senza gironi, non un errore", () => {
    const standings = parseStandings(loadFixture("standings-ita.coppa_italia"));

    expect(standings.groups).toEqual([]);
    expect(standings.season).toBe("2026-27 Coppa Italia");
    expect(standings.endDate).toBe(Date.parse("2027-07-01T03:59Z"));
  });

  it("una competizione a gironi tiene tutti i gironi, ognuno ordinato", () => {
    const standings = parseStandings(loadFixture("standings-uefa.euro"));

    expect(standings.season).toBe("2024 European Championship");
    expect(standings.groups.map((g) => g.name)).toEqual(["Group A", "Group B", "Group C", "Group D", "Group E", "Group F"]);
    expect(standings.groups.every((g) => g.rows.map((r) => r.rank).join() === "1,2,3,4")).toBe(true);
  });
});

describe("aggiornamento delle classifiche", () => {
  it("pinnare una squadra ne scarica la classifica di ogni competizione", async () => {
    const f = await setup([[]]);
    await f.alice.mutation(api.teamPins.add, { conversationId: f.conversations[0], teamId: INTER });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    for (const league of ["ita.1", "uefa.champions", "ita.coppa_italia", "ita.super_cup"]) {
      expect(stub.calls).toContain(standingsPath(league));
    }
    expect(await standingsRow(f.t, "ita.1")).toMatchObject([{ league: "ita.1", season: "2026-27 Italian Serie A", fetchedAt: expect.any(Number) }]);
    expect((await standingsRow(f.t, "ita.1"))[0].groups[0].rows).toHaveLength(20);
    // Una coppa senza tabella si salva senza gironi: il drawer sa che deve mostrare il percorso.
    expect((await standingsRow(f.t, "ita.coppa_italia"))[0].groups).toEqual([]);
  });

  it("alla fine di una partita le classifiche si rifanno dieci minuti dopo", async () => {
    const f = await setup([[INTER]]);
    const before = AT_HALFTIME - 60_000;
    await f.t.run(async (ctx) => {
      const match = parseScoreboard(loadFixture("scoreboard-ita.1-today"), "ita.1").find((m) => m.eventId === COMO_INTER)!;
      const matchId = await ctx.db.insert("footballMatches", { ...match, fetchedAt: before });
      const inter = await ctx.db.query("footballTeams").withIndex("by_teamId", (q) => q.eq("teamId", INTER)).unique();
      await ctx.db.patch("footballTeams", inter!._id, { nextMatchId: matchId });
      await ctx.db.insert("footballTeamSchedules", {
        teamId: INTER,
        results: [],
        fixtures: [],
        competitions: [
          { league: "ita.1", name: "Italian Serie A", shortName: "Serie A", season: "2026-27 Italian Serie A" },
          { league: "uefa.champions", name: "UEFA Champions League", shortName: "UCL", season: "2026-27 UEFA Champions League" },
        ],
        fetchedAt: before,
      });
    });

    const board = loadFixture("scoreboard-ita.1-today");
    const event = board.events.find((e: { id: string }) => e.id === COMO_INTER);
    for (const status of [event.status, event.competitions[0].status]) Object.assign(status.type, { state: "post", name: "STATUS_FULL_TIME" });
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", board);

    await f.t.mutation(internal.footballMatches.tick, {});
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await standingsRow(f.t, "ita.1"))[0].fetchedAt).toBeGreaterThanOrEqual(AT_HALFTIME + TEN_MINUTES);
    expect((await standingsRow(f.t, "uefa.champions"))[0].fetchedAt).toBeGreaterThanOrEqual(AT_HALFTIME + TEN_MINUTES);
  });

  it("il cron delle 6 ore scarica ogni campionato una volta, anche con due chat e più squadre", async () => {
    const f = await setup([[INTER], [JUVENTUS]]);
    await f.t.run(async (ctx) => {
      for (const teamId of [INTER, JUVENTUS]) {
        await ctx.db.insert("footballTeamSchedules", {
          teamId,
          results: [],
          fixtures: [],
          competitions: [
            { league: "ita.1", name: "Italian Serie A", shortName: "Serie A", season: "2026-27 Italian Serie A" },
            { league: "uefa.champions", name: "UEFA Champions League", shortName: "UCL", season: "2026-27 UEFA Champions League" },
          ],
          fetchedAt: AT_HALFTIME,
        });
      }
    });
    stub.calls.length = 0;

    await f.t.mutation(internal.footballMatches.refreshPinnedTeams, {});
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(stub.calls.filter((c) => c === standingsPath("ita.1"))).toHaveLength(1);
    expect(stub.calls.filter((c) => c === standingsPath("uefa.champions"))).toHaveLength(1);
  });

  it("il cron salta tutto il campionato in diretta, anche per un'altra squadra pinnata", async () => {
    // Inter sta giocando in serie A, il Milan è appena stato pinnato: la classifica di serie A aspetta,
    // quella della Champions League no.
    const f = await setup([[INTER, MILAN]]);
    await f.t.run(async (ctx) => {
      const live = parseScoreboard(loadFixture("scoreboard-ita.1-today"), "ita.1").find((m) => m.eventId === COMO_INTER)!;
      const matchId = await ctx.db.insert("footballMatches", { ...live, fetchedAt: AT_HALFTIME });
      const inter = await ctx.db.query("footballTeams").withIndex("by_teamId", (q) => q.eq("teamId", INTER)).unique();
      await ctx.db.patch("footballTeams", inter!._id, { nextMatchId: matchId });
      for (const teamId of [INTER, MILAN]) {
        await ctx.db.insert("footballTeamSchedules", {
          teamId,
          results: [],
          fixtures: [],
          competitions: [
            { league: "ita.1", name: "Italian Serie A", shortName: "Serie A", season: "2026-27 Italian Serie A" },
            { league: "uefa.champions", name: "UEFA Champions League", shortName: "UCL", season: "2026-27 UEFA Champions League" },
          ],
          fetchedAt: AT_HALFTIME,
        });
      }
    });
    stub.calls.length = 0;

    await f.t.mutation(internal.footballMatches.refreshPinnedTeams, {});
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(stub.calls.filter((c) => c === standingsPath("ita.1"))).toEqual([]);
    expect(stub.calls.filter((c) => c === standingsPath("uefa.champions"))).toHaveLength(1);
  });

  it("il refresco del pin salta solo il campionato in diretta", async () => {
    const f = await setup([[INTER, MILAN]]);
    await f.t.run(async (ctx) => {
      const live = parseScoreboard(loadFixture("scoreboard-ita.1-today"), "ita.1").find((m) => m.eventId === COMO_INTER)!;
      const matchId = await ctx.db.insert("footballMatches", { ...live, fetchedAt: AT_HALFTIME });
      const inter = await ctx.db.query("footballTeams").withIndex("by_teamId", (q) => q.eq("teamId", INTER)).unique();
      await ctx.db.patch("footballTeams", inter!._id, { nextMatchId: matchId });
    });
    stub.calls.length = 0;

    await f.t.action(internal.footballTeamSchedules.refresh, { teamId: INTER, standings: true });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(stub.calls.filter((c) => c === standingsPath("ita.1"))).toEqual([]);
    expect(stub.calls.filter((c) => c === standingsPath("uefa.champions"))).toHaveLength(1);
  });

  it("una richiesta fallita non tocca la riga e finisce nei log", async () => {
    const f = await setup([[INTER]]);
    const before = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("footballStandings", { league: "ita.1", ...standingsOf("ita.1"), fetchedAt: AT_HALFTIME - 60_000 });
      return (await ctx.db.get("footballStandings", id))!;
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    stub.reply(standingsPath("ita.1"), "down", 503);

    await f.t.action(internal.footballStandings.refreshLeague, { league: "ita.1" });

    expect(await standingsRow(f.t, "ita.1")).toEqual([before]);
    expect(logged).toHaveBeenCalledWith("Classifica di ita.1:", expect.stringContaining("503"));
  });
});

describe("classifica nel drawer", () => {
  /** La riga del calendario con le competizioni date, e le classifiche già salvate. */
  async function withData(f: Awaited<ReturnType<typeof setup>>, teamId: string, competitions: { league: string; season: string }[], leagues: string[]) {
    await f.t.run(async (ctx) => {
      await ctx.db.insert("footballTeamSchedules", {
        teamId,
        results: [],
        fixtures: [],
        competitions: competitions.map(({ league, season }) => ({ league, name: league, shortName: league, season })),
        fetchedAt: AT_HALFTIME,
      });
      for (const league of leagues) {
        await ctx.db.insert("footballStandings", { league, ...standingsOf(league), fetchedAt: AT_HALFTIME });
      }
    });
  }

  it("restituisce la tabella a chi è nella chat che pinna la squadra", async () => {
    const f = await setup([[INTER], []]);
    await withData(f, INTER, [{ league: "ita.1", season: "2026-27 Italian Serie A" }], ["ita.1"]);

    const view = await f.alice.query(api.footballStandings.forPin, { conversationId: f.conversations[0], teamId: INTER, league: "ita.1" });
    expect(view).toMatchObject({ league: "ita.1", pending: false, season: "2026-27 Italian Serie A", fetchedAt: AT_HALFTIME });
    expect(view?.groups).toHaveLength(1);
    expect(view?.groups[0].rows).toHaveLength(20);
    // Anche l'altra persona della chat lo vede.
    expect(await f.bob.query(api.footballStandings.forPin, { conversationId: f.conversations[0], teamId: INTER, league: "ita.1" })).not.toBeNull();
  });

  it("di una competizione a gironi restituisce solo il girone della squadra", async () => {
    const f = await setup([[ITALY]]);
    await withData(f, ITALY, [{ league: "uefa.nations", season: "2026-27 UEFA Nations League" }], ["uefa.nations"]);

    const view = await f.alice.query(api.footballStandings.forPin, { conversationId: f.conversations[0], teamId: ITALY, league: "uefa.nations" });
    expect(view?.groups).toHaveLength(1);
    expect(view?.groups[0].name).toBe("Group A1");
    expect(view?.groups[0].rows.map((r) => r.teamId)).toContain(ITALY);
  });

  it("non mostra una tabella di un'altra stagione", async () => {
    const f = await setup([[ITALY]]);
    await withData(f, ITALY, [{ league: "uefa.euro", season: "2028 European Championship" }], ["uefa.euro"]);

    const view = await f.alice.query(api.footballStandings.forPin, { conversationId: f.conversations[0], teamId: ITALY, league: "uefa.euro" });
    // La tabella del 2024 non è quella della stagione 2028 della squadra: non si mostra, e non è una risposta arrivata.
    expect(view).toMatchObject({ pending: true, season: "2028 European Championship", groups: [] });
  });

  it("appena pinnata, prima che la classifica arrivi, dice di aspettare", async () => {
    const f = await setup([[INTER]]);
    await f.t.run((ctx) =>
      ctx.db.insert("footballTeamSchedules", {
        teamId: INTER,
        results: [],
        fixtures: [],
        competitions: [{ league: "ita.1", name: "Italian Serie A", shortName: "Serie A", season: "2026-27 Italian Serie A" }],
        fetchedAt: AT_HALFTIME,
      }),
    );

    expect(await f.alice.query(api.footballStandings.forPin, { conversationId: f.conversations[0], teamId: INTER, league: "ita.1" })).toMatchObject({
      pending: true,
      groups: [],
      fetchedAt: null,
    });
  });

  it("non la restituisce a chi non è nella chat o a una chat che non pinna la squadra", async () => {
    const f = await setup([[INTER], []]);
    await withData(f, INTER, [{ league: "ita.1", season: "2026-27 Italian Serie A" }], ["ita.1"]);

    expect(await f.alice.query(api.footballStandings.forPin, { conversationId: f.emptyChat, teamId: INTER, league: "ita.1" })).toBeNull();
    expect(await f.carol.query(api.footballStandings.forPin, { conversationId: f.conversations[0], teamId: INTER, league: "ita.1" })).toBeNull();
    expect(await f.t.query(api.footballStandings.forPin, { conversationId: f.conversations[0], teamId: INTER, league: "ita.1" })).toBeNull();
    expect(await f.alice.query(api.footballStandings.forPin, { conversationId: f.conversations[0], teamId: JUVENTUS, league: "ita.1" })).toBeNull();
  });
});

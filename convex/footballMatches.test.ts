/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { parseScoreboard } from "./espn";
import { espnFetchStub, loadFixture } from "./espnStub.test-helper";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const INTER = "110";
const COMO = "2572";
const MAN_UTD = "360";
const JUVENTUS = "111";
const VENEZIA = "17530";
/** Como-Inter (ita.1), all'intervallo nel tabellone registrato. */
const COMO_INTER = "401874808";
/** Manchester United-Aston Villa (eng.1), nel secondo tempo. */
const MAN_AVL = "401879240";
/** Fiorentina-Juventus (ita.1), in programma alle 19:45 UTC. */
const FIO_JUV = "401875003";

/** Durante l'intervallo di Como-Inter, il giorno in cui i tabelloni sono stati registrati. */
const AT_HALFTIME = Date.parse("2026-11-08T17:50Z");

/** Un tabellone registrato, con una partita cambiata da `patch`. */
function scoreboardWith(league: string, eventId: string, patch: (event: any) => void) {
  const board = loadFixture(`scoreboard-${league}-today`);
  patch(board.events.find((e: { id: string }) => e.id === eventId));
  return board;
}

/**
 * La risposta vera di `/all/teams/{id}` registrata mentre la squadra gioca: `nextEvent` è già la partita dopo,
 * non quella in corso (`team-110.json` è stato registrato durante Como-Inter e dà già Atalanta-Inter).
 */
function teamWithNextEvent(
  teamId: string,
  eventId: string,
  date: string,
  home: { id: string; name: string; abbreviation: string },
  away: { id: string; name: string; abbreviation: string },
) {
  const team = (t: { id: string; name: string; abbreviation: string }) => ({
    id: t.id,
    displayName: t.name,
    shortDisplayName: t.name,
    abbreviation: t.abbreviation,
  });
  return {
    team: {
      id: teamId,
      displayName: `team ${teamId}`,
      shortDisplayName: `team ${teamId}`,
      abbreviation: "TST",
      nextEvent: [
        {
          id: eventId,
          date,
          league: { slug: "ita.1" },
          competitions: [
            {
              status: { displayClock: "0'", type: { state: "pre", name: "STATUS_SCHEDULED" } },
              competitors: [
                { homeAway: "home", team: team(home) },
                { homeAway: "away", team: team(away) },
              ],
            },
          ],
        },
      ],
    },
  };
}

/** Imposta lo stato ESPN di una partita (sia sull'evento sia sulla competizione, come fa ESPN). */
function setStatus(event: any, state: string, name: string, clock?: string) {
  for (const status of [event.status, event.competitions[0].status]) {
    if (!status) continue;
    status.type.state = state;
    status.type.name = name;
    if (clock) status.displayClock = clock;
  }
}

function setScore(event: any, home: number, away: number) {
  const [h, a] = ["home", "away"].map((side) => event.competitions[0].competitors.find((c: { homeAway: string }) => c.homeAway === side));
  h.score = String(home);
  a.score = String(away);
}

/** Indice costruito; una chat per ogni gruppo di squadre in `chats`; le partite del tabellone come prossime partite. */
async function setup(chats: string[][]) {
  const t = convexTest(schema, modules);
  await t.action(internal.footballTeams.rebuildIndex, {});
  const boards = [
    ...parseScoreboard(loadFixture("scoreboard-ita.1-today"), "ita.1"),
    ...parseScoreboard(loadFixture("scoreboard-eng.1-today"), "eng.1"),
  ];
  await t.run(async (ctx) => {
    const alice = await ctx.db.insert("profiles", { tokenIdentifier: "test|alice", name: "alice", email: "alice@example.com", avatarIndex: 0 });
    for (const [i, teams] of chats.entries()) {
      const friend = await ctx.db.insert("profiles", { tokenIdentifier: `test|f${i}`, name: `f${i}`, email: `f${i}@example.com`, avatarIndex: 0 });
      const conversationId = await ctx.db.insert("conversations", { kind: "direct", createdBy: alice, directKey: `${alice}_${friend}`, lastMessageAt: 0 });
      for (const teamId of teams) await ctx.db.insert("teamPins", { conversationId, teamId, pinnedBy: alice, pinnedAt: 0 });
    }
    for (const match of boards) {
      const id = await ctx.db.insert("footballMatches", { ...match, fetchedAt: AT_HALFTIME - 30_000 });
      for (const side of [match.home, match.away]) {
        const team = await ctx.db
          .query("footballTeams")
          .withIndex("by_teamId", (q) => q.eq("teamId", side.teamId))
          .unique();
        if (team) await ctx.db.patch("footballTeams", team._id, { nextMatchId: id });
      }
    }
  });
  return t;
}

type T = Awaited<ReturnType<typeof setup>>;

const match = (t: T, eventId: string) =>
  t.run((ctx) =>
    ctx.db
      .query("footballMatches")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique(),
  );
const team = (t: T, teamId: string) =>
  t.run((ctx) =>
    ctx.db
      .query("footballTeams")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .unique(),
  );

async function runTick(t: T) {
  await t.mutation(internal.footballMatches.tick, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

const scoreboardCalls = () => stub.calls.filter((c) => c.includes("/scoreboard"));

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

describe("il giro dei 30 secondi", () => {
  it("senza squadre pinnate non chiede niente", async () => {
    const t = await setup([]);
    await runTick(t);
    expect(stub.calls.filter((c) => !c.endsWith("/teams"))).toEqual([]);
  });

  it("non chiede niente per una partita lontana", async () => {
    const t = await setup([[JUVENTUS]]);
    await runTick(t);
    expect(scoreboardCalls()).toEqual([]);
  });

  it("chiede un tabellone per competizione, anche con due chat e un derby", async () => {
    const t = await setup([[INTER, COMO], [INTER], [MAN_UTD]]);
    await runTick(t);
    expect(scoreboardCalls().sort()).toEqual([
      "/site/v2/sports/soccer/eng.1/scoreboard?dates=20261108",
      "/site/v2/sports/soccer/ita.1/scoreboard?dates=20261108",
    ]);
  });

  it("segue una partita a meno di 60 minuti dal calcio d'inizio", async () => {
    const t = await setup([[JUVENTUS]]);
    vi.setSystemTime(Date.parse("2026-11-08T18:50Z"));
    await runTick(t);
    expect(scoreboardCalls()).toEqual(["/site/v2/sports/soccer/ita.1/scoreboard?dates=20261108"]);
  });
});

describe("aggiornamenti in diretta", () => {
  it("cambiano punteggio, minuto e stato; conta solo lo stato ESPN, non il suo nome", async () => {
    const t = await setup([[INTER]]);
    const before = (await match(t, COMO_INTER))!;
    stub.reply(
      "/site/v2/sports/soccer/ita.1/scoreboard",
      scoreboardWith("ita.1", COMO_INTER, (e) => {
        setStatus(e, "in", "STATUS_IN_PROGRESS", "67'");
        setScore(e, 3, 1);
      }),
    );
    vi.setSystemTime(AT_HALFTIME + 30_000);
    await runTick(t);

    expect(await match(t, COMO_INTER)).toMatchObject({
      state: "in",
      statusName: "STATUS_IN_PROGRESS",
      score: { home: 3, away: 1 },
      clock: "67'",
    });
    expect((await match(t, COMO_INTER))!.fetchedAt).toBeGreaterThan(before.fetchedAt);
  });

  it("partite in ritardo e sospese restano seguite", async () => {
    const t = await setup([[INTER], [JUVENTUS]]);
    vi.setSystemTime(Date.parse("2026-11-08T20:15Z")); // mezz'ora dopo il calcio d'inizio di Fiorentina-Juventus
    const board = scoreboardWith("ita.1", COMO_INTER, (e) => setStatus(e, "in", "STATUS_SUSPENDED"));
    setStatus(board.events.find((e: { id: string }) => e.id === FIO_JUV), "pre", "STATUS_DELAYED");
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", board);

    await runTick(t);
    await runTick(t);

    expect(scoreboardCalls()).toHaveLength(2);
    expect(await match(t, COMO_INTER)).toMatchObject({ state: "in", statusName: "STATUS_SUSPENDED" });
    expect(await match(t, FIO_JUV)).toMatchObject({ state: "pre", statusName: "STATUS_DELAYED" });
  });
});

describe("fine della partita", () => {
  it("diventa l'ultima partita, si cerca la prossima e il giro dopo non chiede più niente", async () => {
    const t = await setup([[INTER]]);
    stub.reply(
      "/site/v2/sports/soccer/ita.1/scoreboard",
      scoreboardWith("ita.1", COMO_INTER, (e) => {
        setStatus(e, "post", "STATUS_FULL_TIME", "90'+5'");
        setScore(e, 2, 1);
      }),
    );
    await runTick(t);

    const finished = (await match(t, COMO_INTER))!;
    expect(finished).toMatchObject({ state: "post", score: { home: 2, away: 1 } });
    const inter = (await team(t, INTER))!;
    expect(inter.lastMatchId).toBe(finished._id);
    expect(stub.calls).toContain("/site/v2/sports/soccer/all/teams/110");
    expect((await t.run((ctx) => ctx.db.get("footballMatches", inter.nextMatchId as Id<"footballMatches">)))?.eventId).toBe("401875001");

    const calls = scoreboardCalls().length;
    await runTick(t);
    expect(scoreboardCalls()).toHaveLength(calls);
  });

  it("una partita rinviata fa cercare la prossima", async () => {
    const t = await setup([[INTER]]);
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", scoreboardWith("ita.1", COMO_INTER, (e) => setStatus(e, "post", "STATUS_POSTPONED")));
    await runTick(t);

    expect(await match(t, COMO_INTER)).toMatchObject({ state: "post", statusName: "STATUS_POSTPONED" });
    expect(stub.calls).toContain("/site/v2/sports/soccer/all/teams/110");
  });

  it("una partita sparita dal tabellone del suo giorno fa cercare la prossima", async () => {
    const t = await setup([[INTER]]);
    const board = loadFixture("scoreboard-ita.1-today");
    board.events = board.events.filter((e: { id: string }) => e.id !== COMO_INTER);
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", board);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.setSystemTime(AT_HALFTIME + 11 * 60_000); // dopo 10 minuti senza notizie
    await runTick(t);

    expect(stub.calls).toContain("/site/v2/sports/soccer/all/teams/110");
    expect((await team(t, INTER))?.nextMatchId).not.toBe((await match(t, COMO_INTER))?._id);
  });
});

describe("risposte che si incrociano", () => {
  it("una partita rinviata che ESPN dà ancora `pre` fa cercare la prossima", async () => {
    const t = await setup([[JUVENTUS]]);
    vi.setSystemTime(Date.parse("2026-11-08T19:00Z"));
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", scoreboardWith("ita.1", FIO_JUV, (e) => setStatus(e, "pre", "STATUS_POSTPONED")));
    await runTick(t);

    expect(stub.calls).toContain("/site/v2/sports/soccer/all/teams/111");
    expect((await team(t, JUVENTUS))?.lastMatchId).toBe((await match(t, FIO_JUV))?._id);
  });

  it("una ricerca della prossima durante la partita non mostra quella dopo", async () => {
    const t = await setup([[JUVENTUS]]);
    vi.setSystemTime(Date.parse("2026-11-08T20:15Z")); // Fiorentina-Juventus è in corso
    stub.reply(
      "/site/v2/sports/soccer/ita.1/scoreboard",
      scoreboardWith("ita.1", FIO_JUV, (e) => {
        setStatus(e, "in", "STATUS_SECOND_HALF", "60'");
        setScore(e, 1, 0);
      }),
    );
    await runTick(t);
    const live = (await match(t, FIO_JUV))!;
    expect(live).toMatchObject({ state: "in" });

    // Il cron delle 6 ore, mentre si gioca: ESPN dà già come prossima la partita dopo (Venezia).
    stub.reply(
      "/site/v2/sports/soccer/all/teams/111",
      teamWithNextEvent(
        JUVENTUS,
        "401875099",
        "2026-11-22T11:30Z",
        { id: JUVENTUS, name: "Juventus", abbreviation: "JUV" },
        { id: VENEZIA, name: "Venezia", abbreviation: "VEN" },
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await t.action(internal.footballMatches.refreshNextMatch, { teamId: JUVENTUS });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // La partita in corso resta la prossima (e quindi quella che il chip mostra), non quella fra due settimane.
    expect((await team(t, JUVENTUS))?.nextMatchId).toBe(live._id);

    // Anche se ESPN non dà nessuna prossima partita, la diretta resta.
    stub.reply("/site/v2/sports/soccer/all/teams/111", { team: { nextEvent: [] } });
    await t.action(internal.footballMatches.refreshNextMatch, { teamId: JUVENTUS });
    expect((await team(t, JUVENTUS))?.nextMatchId).toBe(live._id);

    // E il giro dei 30 secondi continua ad aggiornarla.
    vi.setSystemTime(Date.parse("2026-11-08T20:15:30Z"));
    stub.reply(
      "/site/v2/sports/soccer/ita.1/scoreboard",
      scoreboardWith("ita.1", FIO_JUV, (e) => {
        setStatus(e, "in", "STATUS_SECOND_HALF", "61'");
        setScore(e, 1, 1);
      }),
    );
    await runTick(t);
    expect(await match(t, FIO_JUV)).toMatchObject({ state: "in", score: { home: 1, away: 1 }, clock: "61'" });
  });

  it("una risposta più vecchia di quella già scritta si scarta", async () => {
    const t = await setup([[INTER]]);
    const before = (await match(t, COMO_INTER))!;
    const [stale] = parseScoreboard(scoreboardWith("ita.1", COMO_INTER, (e) => setScore(e, 0, 0)), "ita.1").filter((m) => m.eventId === COMO_INTER);
    await t.mutation(internal.footballMatches.applyPoll, { matches: [stale], details: [], missing: [], fetchedAt: before.fetchedAt - 1 });
    expect(await match(t, COMO_INTER)).toEqual(before);
  });

  it("una partita finita che arriva dalla ricerca della prossima diventa comunque l'ultima", async () => {
    const t = await setup([[INTER]]);
    const [ended] = parseScoreboard(scoreboardWith("ita.1", COMO_INTER, (e) => setStatus(e, "post", "STATUS_FULL_TIME")), "ita.1").filter(
      (m) => m.eventId === COMO_INTER,
    );
    await t.mutation(internal.footballMatches.saveNextMatch, { teamId: INTER, match: ended, fetchedAt: AT_HALFTIME });
    expect((await team(t, INTER))?.lastMatchId).toBe((await match(t, COMO_INTER))?._id);
  });

  it("una partita sparita non fa cercare la prossima a ogni giro", async () => {
    const t = await setup([[INTER]]);
    const board = loadFixture("scoreboard-ita.1-today");
    board.events = board.events.filter((e: { id: string }) => e.id !== COMO_INTER);
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", board);
    const inter = loadFixture("team-110");
    inter.team.nextEvent[0] = { ...loadFixture("scoreboard-ita.1-today").events.find((e: { id: string }) => e.id === COMO_INTER), league: { slug: "ita.1" } };
    stub.reply("/site/v2/sports/soccer/all/teams/110", inter);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.setSystemTime(AT_HALFTIME + 11 * 60_000);
    await runTick(t);
    vi.setSystemTime(AT_HALFTIME + 12 * 60_000);
    await runTick(t);

    expect(stub.calls.filter((c) => c.endsWith("/all/teams/110"))).toHaveLength(1);
  });
});

describe("errori di ESPN", () => {
  it.each([
    ["una risposta non 200", () => stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", "down", 503)],
    [
      "un campo mancante",
      () =>
        stub.reply(
          "/site/v2/sports/soccer/ita.1/scoreboard",
          scoreboardWith("ita.1", COMO_INTER, (e) => {
            setScore(e, 5, 0);
            delete e.competitions[0].status.type.state;
          }),
        ),
    ],
  ])("%s non tocca le partite né `fetchedAt`, e finisce nei log", async (_, breakEspn) => {
    const t = await setup([[INTER]]);
    const before = await match(t, COMO_INTER);
    breakEspn();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.setSystemTime(AT_HALFTIME + 30_000);
    await runTick(t);

    expect(await match(t, COMO_INTER)).toEqual(before);
    expect(logged).toHaveBeenCalledWith("Tabellone ita.1:", expect.any(String));
  });
});

describe("pulizia di ogni giorno", () => {
  it("toglie le partite di più di 7 giorni fa, tranne l'ultima o la prossima di una squadra", async () => {
    const t = await setup([]);
    vi.setSystemTime(Date.parse("2026-11-16T12:00Z"));
    const inter = (await team(t, INTER))!;
    const comoInter = (await match(t, COMO_INTER))!;
    const fioJuv = (await match(t, FIO_JUV))!;
    await t.run(async (ctx) => {
      // Tutte le squadre perdono la prossima partita, tranne la Juventus; l'Inter tiene Como-Inter come ultima.
      for (const row of await ctx.db.query("footballTeams").collect()) await ctx.db.patch("footballTeams", row._id, { nextMatchId: undefined });
      await ctx.db.patch("footballTeams", inter._id, { lastMatchId: comoInter._id });
      const juve = await ctx.db.query("footballTeams").withIndex("by_teamId", (q) => q.eq("teamId", JUVENTUS)).unique();
      await ctx.db.patch("footballTeams", juve!._id, { nextMatchId: fioJuv._id });
      // Le altre restano come le ha lasciate ESPN: finite, in corso o mai iniziate.
    });

    await t.mutation(internal.footballMatches.cleanup, {});

    const left = await t.run((ctx) => ctx.db.query("footballMatches").collect());
    expect(left.map((m) => m.eventId).sort()).toEqual([FIO_JUV, COMO_INTER].sort());
  });
});

describe("lettura dei tabelloni", () => {
  it("intervallo, tempi supplementari e rigori", () => {
    const halftime = parseScoreboard(loadFixture("scoreboard-ita.1-today"), "ita.1").find((m) => m.eventId === COMO_INTER);
    expect(halftime).toMatchObject({ state: "in", statusName: "STATUS_HALFTIME", clock: "45'+1'", score: { home: 2, away: 0 } });
    expect(halftime?.home).toMatchObject({ teamId: INTER });
    expect(halftime?.away).toMatchObject({ teamId: COMO });

    expect(parseScoreboard(loadFixture("scoreboard-fifa.world-aet"), "fifa.world")[0]).toMatchObject({
      state: "post",
      statusName: "STATUS_FINAL_AET",
      score: { home: 1, away: 0 },
    });
    const final = parseScoreboard(loadFixture("scoreboard-fifa.world-pens"), "fifa.world")[0];
    expect(final).toMatchObject({ state: "post", statusName: "STATUS_FINAL_PEN" });
    expect([final.score?.home, final.score?.away]).toEqual([3, 3]);
    expect([final.shootout?.home, final.shootout?.away].sort()).toEqual([2, 4]);
  });

  it("una partita non ancora iniziata non ha punteggio", () => {
    const next = parseScoreboard(loadFixture("scoreboard-ita.1-today"), "ita.1").find((m) => m.eventId === FIO_JUV);
    expect(next).toMatchObject({ state: "pre", statusName: "STATUS_SCHEDULED" });
    expect(next?.score).toBeUndefined();
  });
});

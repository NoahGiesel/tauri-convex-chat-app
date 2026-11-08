/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { parseScoreboard, parseSummary } from "./espn";
import { espnFetchStub, loadFixture } from "./espnStub.test-helper";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const INTER = "110";
const COMO = "2572";
/** Como-Inter (ita.1), all'intervallo nel tabellone registrato. */
const COMO_INTER = "401874808";
const AT_HALFTIME = Date.parse("2026-11-08T17:50Z");
const SUMMARY_PATH = `/site/v2/sports/soccer/ita.1/summary?event=${COMO_INTER}`;

/** Il riassunto registrato di Napoli-Lazio, con le squadre di un'altra partita (casa e trasferta). */
function summaryFor(homeId: string, awayId: string) {
  const ids: Record<string, string> = { "114": homeId, "112": awayId };
  const summary = loadFixture("summary-401874810");
  for (const c of summary.header.competitions[0].competitors) c.id = ids[c.id];
  for (const e of summary.keyEvents) if (e.team) e.team.id = ids[e.team.id];
  for (const r of summary.rosters) r.team.id = ids[r.team.id];
  for (const t of summary.boxscore.teams) t.team.id = ids[t.team.id];
  return summary;
}

async function setup() {
  const t = convexTest(schema, modules);
  await t.action(internal.footballTeams.rebuildIndex, {});
  const ids = await t.run(async (ctx) => {
    const alice = await ctx.db.insert("profiles", { tokenIdentifier: "test|alice", name: "alice", email: "alice@example.com", avatarIndex: 0 });
    const bob = await ctx.db.insert("profiles", { tokenIdentifier: "test|bob", name: "bob", email: "bob@example.com", avatarIndex: 0 });
    const conversationId = await ctx.db.insert("conversations", { kind: "direct", createdBy: alice, directKey: `${alice}_${bob}`, lastMessageAt: 0 });
    await ctx.db.insert("teamPins", { conversationId, teamId: INTER, pinnedBy: alice, pinnedAt: 0 });
    const match = parseScoreboard(loadFixture("scoreboard-ita.1-today"), "ita.1").find((m) => m.eventId === COMO_INTER)!;
    const id = await ctx.db.insert("footballMatches", { ...match, fetchedAt: AT_HALFTIME - 30_000 });
    const inter = await ctx.db
      .query("footballTeams")
      .withIndex("by_teamId", (q) => q.eq("teamId", INTER))
      .unique();
    await ctx.db.patch("footballTeams", inter!._id, { nextMatchId: id });
    for (const profileId of [alice, bob]) await ctx.db.insert("members", { conversationId, profileId, lastReadAt: 0, lastMessageAt: 0 });
    // Una seconda chat di alice, senza squadre pinnate.
    const carol = await ctx.db.insert("profiles", { tokenIdentifier: "test|carol", name: "carol", email: "carol@example.com", avatarIndex: 0 });
    const other = await ctx.db.insert("conversations", { kind: "direct", createdBy: alice, directKey: `${alice}_${carol}`, lastMessageAt: 0 });
    for (const profileId of [alice, carol]) await ctx.db.insert("members", { conversationId: other, profileId, lastReadAt: 0, lastMessageAt: 0 });
    return { conversationId, other };
  });
  const alice = t.withIdentity({ tokenIdentifier: "test|alice" });
  const ask = (as = alice, conversationId = ids.conversationId) => as.query(api.footballMatches.details, { conversationId, eventId: COMO_INTER });
  return { t, alice, ask, ...ids };
}

/** Il tabellone registrato con Como-Inter finita. */
function finishedBoard() {
  const board = loadFixture("scoreboard-ita.1-today");
  const event = board.events.find((e: { id: string }) => e.id === COMO_INTER);
  for (const status of [event.status, event.competitions[0].status]) Object.assign(status.type, { state: "post", name: "STATUS_FULL_TIME" });
  return board;
}

async function runTick(t: Awaited<ReturnType<typeof setup>>["t"]) {
  await t.mutation(internal.footballMatches.tick, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

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

describe("riassunto della partita", () => {
  it("si legge dal riassunto ESPN e si alleggerisce", () => {
    const raw = loadFixture("summary-401874810");
    const details = parseSummary(raw);

    expect(details).toMatchObject({ competition: "Italian Serie A", venue: "Stadio Diego Armando Maradona" });
    expect(details.events).toContainEqual({ kind: "goal", minute: "28'", side: "away", player: "Davide Frattesi", other: "Tijjani Noslin" });
    expect(details.events).toContainEqual({ kind: "ownGoal", minute: "48'", side: "home", player: "Alfonso Pedraza" });
    expect(details.events).toContainEqual({ kind: "yellowCard", minute: "44'", side: "home", player: "Noa Lang" });
    expect(details.events).toContainEqual({ kind: "substitution", minute: "33'", side: "away", player: "Diogo Leite", other: "Josip Sutalo" });
    expect(details.events.map((e) => e.kind)).not.toContain(undefined);
    expect(details.events).toHaveLength(15); // senza calcio d'inizio, intervallo, interruzioni

    const home = details.lineups.find((l) => l.side === "home")!;
    expect(home.formation).toBe("3-4-2-1");
    expect(home.starters).toHaveLength(11);
    expect(home.starters[0]).toEqual({ name: "Vanja Milinkovic-Savic", jersey: "32" });
    expect(home.bench.length).toBeGreaterThan(0);

    expect(details.stats).toEqual([
      { key: "possession", home: 49, away: 51 },
      { key: "shots", home: 15, away: 15 },
      { key: "shotsOnTarget", home: 6, away: 6 },
      { key: "corners", home: 6, away: 6 },
      { key: "fouls", home: 12, away: 11 },
      { key: "offsides", home: 2, away: 1 },
    ]);
    expect(JSON.stringify(details).length).toBeLessThan(8_000);
  });

  it("una sezione che manca resta vuota; senza intestazione il riassunto non vale", () => {
    const raw = loadFixture("summary-401874810");
    delete raw.rosters;
    delete raw.boxscore;
    raw.keyEvents = [];
    expect(parseSummary(raw)).toMatchObject({ events: [], lineups: [], stats: [] });

    const withShootout = loadFixture("summary-401874810");
    withShootout.keyEvents.push({ type: { type: "goal" }, clock: { displayValue: "120'" }, team: { id: "114" }, shootout: true });
    expect(parseSummary(withShootout).events).toHaveLength(15); // i tiri dei rigori non sono gol della partita

    const broken = loadFixture("summary-401874810");
    delete broken.header;
    expect(() => parseSummary(broken)).toThrow(/header missing/);
  });
});

describe("dettagli nel drawer", () => {
  it("si scaricano mentre la partita è seguita", async () => {
    const { t, alice, ask, other } = await setup();
    expect(await ask()).toBeNull();
    stub.reply(SUMMARY_PATH, summaryFor(INTER, COMO));
    await runTick(t);

    const details = await ask();
    expect(details?.events.length).toBeGreaterThan(0);
    expect(details?.stats[0]).toEqual({ key: "possession", home: 49, away: 51 });
    expect(await ask(t.withIdentity({ tokenIdentifier: "test|nobody" }))).toBeNull(); // chi non è entrato non li vede
    expect(await ask(t.withIdentity({ tokenIdentifier: "test|carol" }))).toBeNull(); // chi non è nella chat
    expect(await ask(alice, other)).toBeNull(); // una chat che non ha pinnato né il Como né l'Inter
  });

  it("l'ultimo arriva alla fine della partita e sostituisce quello dal vivo, poi resta salvato", async () => {
    const { t, ask } = await setup();
    stub.reply(SUMMARY_PATH, summaryFor(INTER, COMO));
    await runTick(t);

    const final = summaryFor(INTER, COMO);
    final.boxscore.teams[0].statistics.find((s: { name: string }) => s.name === "wonCorners").displayValue = "9";
    stub.reply(SUMMARY_PATH, final);
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", finishedBoard());
    vi.setSystemTime(AT_HALFTIME + 60 * 60_000);
    await runTick(t);
    await runTick(t);

    expect(stub.calls.filter((c) => c === SUMMARY_PATH)).toHaveLength(2);
    expect((await ask())?.stats).toContainEqual({ key: "corners", home: 9, away: 6 });
  });

  it("se alla fine il riassunto non arriva si riprova, finché arriva", async () => {
    const { t, ask } = await setup();
    stub.reply("/site/v2/sports/soccer/ita.1/scoreboard", finishedBoard());
    let failures = 2;
    vi.stubGlobal("fetch", async (input: URL | string | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/summary") && failures-- > 0) return new Response("down", { status: 503 });
      if (url.includes("/summary")) return new Response(JSON.stringify(summaryFor(INTER, COMO)), { status: 200 });
      return stub.fetch(input);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runTick(t);

    expect(failures).toBe(-1); // due fallimenti, poi il terzo tentativo
    expect((await ask())?.lineups).toHaveLength(2);
  });

  it("se il riassunto non arriva restano i dettagli di prima, e il punteggio si aggiorna lo stesso", async () => {
    const { t, ask } = await setup();
    stub.reply(SUMMARY_PATH, summaryFor(INTER, COMO));
    await runTick(t);
    const before = await ask();

    stub.reply(SUMMARY_PATH, "down", 503);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.setSystemTime(AT_HALFTIME + 30_000);
    await runTick(t);

    expect(await ask()).toEqual(before);
    expect(logged).toHaveBeenCalledWith(`Riassunto ${COMO_INTER}:`, expect.stringContaining("503"));
  });
});

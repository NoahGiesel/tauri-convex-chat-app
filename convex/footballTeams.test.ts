/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { espnFetchStub, loadFixture } from "./espnStub.test-helper";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function signedIn() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("profiles", { tokenIdentifier: "test|alice", name: "alice", email: "alice@example.com", avatarIndex: 0 });
  });
  return { t, alice: t.withIdentity({ tokenIdentifier: "test|alice" }) };
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

let stub: ReturnType<typeof espnFetchStub>;
beforeEach(() => {
  stub = espnFetchStub();
  vi.stubGlobal("fetch", stub.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("indice delle squadre", () => {
  it("si costruisce dalle liste ESPN e si cerca per nome", async () => {
    const { t, alice } = await signedIn();
    await t.action(internal.footballTeams.rebuildIndex, {});

    const rows = await alice.query(api.footballTeams.search, { text: "inter" });
    expect(rows[0]).toMatchObject({ teamId: "110", name: "Internazionale", competition: "Serie A", national: false });
  });

  it("ignora accenti e maiuscole e accetta nomi parziali", async () => {
    const { t, alice } = await signedIn();
    await t.action(internal.footballTeams.rebuildIndex, {});
    const first = async (text: string) => (await alice.query(api.footballTeams.search, { text }))[0]?.name;

    expect(await first("ATLÉTICO")).toBe("Atlético Madrid");
    expect(await first("juv")).toBe("Juventus");
    expect(await first("mönchengladbach")).toBe("Borussia Mönchengladbach");
    expect(await first("Paris Saint")).toBe("Paris Saint-Germain");
  });

  it("conosce i nomi italiani e i soprannomi", async () => {
    const { t, alice } = await signedIn();
    await t.action(internal.footballTeams.rebuildIndex, {});
    const first = async (text: string) => (await alice.query(api.footballTeams.search, { text }))[0]?.name;

    expect(await first("bayern monaco")).toBe("Bayern Munich");
    expect(await first("siviglia")).toBe("Sevilla");
    expect(await first("psg")).toBe("Paris Saint-Germain");
    expect(await first("milan")).toBe("AC Milan");
    expect(await first("spagna")).toBe("Spain");
  });

  it("ha tutte le nazionali, anche fuori dai tornei", async () => {
    const { t, alice } = await signedIn();
    await t.action(internal.footballTeams.rebuildIndex, {});

    expect((await alice.query(api.footballTeams.search, { text: "italia" }))[0]).toMatchObject({
      name: "Italy",
      national: true,
      competition: null,
    });
    expect(names(await alice.query(api.footballTeams.search, { text: "argentina" }))).toContain("Argentina");
    expect(names(await alice.query(api.footballTeams.search, { text: "andorra" }))).toContain("Andorra");
  });

  it("non mette nell'indice squadre giovanili né femminili", async () => {
    const { t, alice } = await signedIn();
    const ita = loadFixture("teams-ita.1");
    ita.sports[0].leagues[0].teams.push(
      { team: { id: "90001", abbreviation: "JUV", displayName: "Juventus U23", shortDisplayName: "Juventus U23" } },
      { team: { id: "90002", abbreviation: "JUV", displayName: "Juventus Women", shortDisplayName: "Juventus" } },
    );
    stub.reply("/site/v2/sports/soccer/ita.1/teams", ita);
    await t.action(internal.footballTeams.rebuildIndex, {});

    expect(names(await alice.query(api.footballTeams.search, { text: "juventus" }))).toEqual(["Juventus"]);
  });

  it("se ESPN non risponde l'indice resta com'era", async () => {
    const { t, alice } = await signedIn();
    await t.action(internal.footballTeams.rebuildIndex, {});

    stub.reply("/site/v2/sports/soccer/fifa.friendly/teams", "down", 503);
    await expect(t.action(internal.footballTeams.rebuildIndex, {})).rejects.toThrow(/HTTP 503/);

    expect(names(await alice.query(api.footballTeams.search, { text: "italia" }))).toEqual(["Italy"]);
  });

  it("se il formato di ESPN cambia l'indice resta com'era", async () => {
    const { t, alice } = await signedIn();
    await t.action(internal.footballTeams.rebuildIndex, {});

    const ger = loadFixture("teams-ger.1");
    delete ger.sports[0].leagues[0].teams[0].team.id;
    stub.reply("/site/v2/sports/soccer/ger.1/teams", ger);
    await expect(t.action(internal.footballTeams.rebuildIndex, {})).rejects.toThrow(/team\.id missing/);

    expect(names(await alice.query(api.footballTeams.search, { text: "bayern" }))).toEqual(["Bayern Munich"]);
  });

  it("una squadra che esce dalle liste non si trova più", async () => {
    const { t, alice } = await signedIn();
    await t.action(internal.footballTeams.rebuildIndex, {});
    expect(names(await alice.query(api.footballTeams.search, { text: "cagliari" }))[0]).toBe("Cagliari");

    const ita = loadFixture("teams-ita.1");
    ita.sports[0].leagues[0].teams = ita.sports[0].leagues[0].teams.filter((x: { team: { id: string } }) => x.team.id !== "2925");
    stub.reply("/site/v2/sports/soccer/ita.1/teams", ita);
    await t.action(internal.footballTeams.rebuildIndex, {});

    expect(names(await alice.query(api.footballTeams.search, { text: "cagliari" }))).not.toContain("Cagliari");
  });

  it("chi non è entrato non cerca, e un testo troppo corto non dà risultati", async () => {
    const { t, alice } = await signedIn();
    await t.action(internal.footballTeams.rebuildIndex, {});

    expect(await t.query(api.footballTeams.search, { text: "inter" })).toEqual([]);
    expect(await alice.query(api.footballTeams.search, { text: "i" })).toEqual([]);
  });
});

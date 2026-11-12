import { describe, expect, it } from "vitest";
import type { TeamView } from "./match-schedule";
import { drawerTeam } from "./match-derby";

const team = (teamId: string, shortName: string): TeamView => ({
  teamId,
  name: shortName,
  shortName,
  abbreviation: shortName.slice(0, 3).toUpperCase(),
  logo: null,
});
const INTER = team("110", "Inter");
const MILAN = team("103", "Milan");

describe("derby: la squadra mostrata", () => {
  it("si apre sulla squadra pinnata per prima", () => {
    expect(drawerTeam([INTER, MILAN], null)).toBe(INTER);
  });

  it("lo scambio mostra l'altra squadra pinnata", () => {
    expect(drawerTeam([INTER, MILAN], MILAN.teamId)).toBe(MILAN);
  });

  it("quando il chip si divide resta la sua squadra, anche se l'altra era quella scelta", () => {
    expect(drawerTeam([MILAN], INTER.teamId)).toBe(MILAN);
  });
});

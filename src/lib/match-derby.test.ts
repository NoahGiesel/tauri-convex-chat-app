import { describe, expect, it } from "vitest";
import type { TeamView } from "./match-schedule";
import { drawerTeam, keptLeague } from "./match-derby";
import type { Competition } from "./match-standings";

const team = (teamId: string, shortName: string): TeamView => ({
  teamId,
  name: shortName,
  shortName,
  abbreviation: shortName.slice(0, 3).toUpperCase(),
  logo: null,
});
const INTER = team("110", "Inter");
const MILAN = team("103", "Milan");

const competition = (league: string, season = "2026-27"): Competition => ({
  league,
  name: league,
  shortName: league,
  season,
});

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

describe("derby: la competizione dopo lo scambio", () => {
  it("resta quella scelta se anche l'altra squadra la gioca", () => {
    expect(keptLeague("uefa.champions", "ita.1", [competition("ita.1"), competition("uefa.champions")])).toBe("uefa.champions");
  });

  it("altrimenti torna alla competizione del derby", () => {
    expect(keptLeague("uefa.champions", "ita.coppa_italia", [competition("ita.1"), competition("ita.coppa_italia")])).toBe(
      "ita.coppa_italia",
    );
  });

  it("la competizione del derby torna anche quando le competizioni della squadra non sono ancora arrivate", () => {
    expect(keptLeague("uefa.champions", "ita.1", [])).toBe("ita.1");
  });
});

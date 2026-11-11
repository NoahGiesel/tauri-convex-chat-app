import { describe, expect, it } from "vitest";
import {
  initialLeague,
  knockoutSteps,
  pathSteps,
  standingsView,
  tableRows,
  zoneLegend,
  type Competition,
  type StandingsGroup,
  type TeamStandings,
} from "./match-standings";
import type { ScheduleMatch, TeamSchedule } from "./match-schedule";

const day = 24 * 60 * 60_000;
const kickoff = Date.parse("2026-11-08T17:00Z");
const INTER = "110";

function row(over: Partial<StandingsGroup["rows"][number]> & Pick<StandingsGroup["rows"][number], "teamId">) {
  return {
    rank: 1,
    name: "Internazionale",
    shortName: "Inter",
    played: 11,
    goalDifference: 15,
    points: 28,
    ...over,
  };
}

function standings(groups: StandingsGroup[], over: Partial<TeamStandings> = {}): TeamStandings {
  return {
    league: "ita.1",
    pending: false,
    season: "2026-27 Italian Serie A",
    endDate: Date.parse("2027-07-01T03:59Z"),
    groups,
    fetchedAt: kickoff,
    ...over,
  };
}

function match(over: Partial<ScheduleMatch> & Pick<ScheduleMatch, "eventId" | "kickoff" | "league">): ScheduleMatch {
  return {
    leagueName: "Serie A",
    round: "2026-27 Italian Serie A",
    opponent: { teamId: "103", name: "AC Milan", shortName: "Milan", abbreviation: "MIL" },
    home: true,
    state: "post",
    score: { home: 2, away: 1 },
    ...over,
  };
}

function schedule(results: ScheduleMatch[], fixtures: ScheduleMatch[] = [], competitions: Competition[] = []): TeamSchedule {
  return { teamId: INTER, pending: false, results, fixtures, competitions, fetchedAt: kickoff };
}

const SERIE_A = standings([
  {
    name: "2026-2027 Italian Serie A",
    rows: [
      row({ teamId: "112", rank: 1, name: "Lazio", shortName: "Lazio", zone: { color: "81D6AC", label: "Champions League" } }),
      row({ teamId: INTER, rank: 2, zone: { color: "81D6AC", label: "Champions League" } }),
      row({ teamId: "108", rank: 3, name: "Juventus", shortName: "Juventus", zone: { color: "FF7F84", label: "Relegated" } }),
    ],
  },
]);

describe("tab Classifica: righe della tabella", () => {
  it("la squadra pinnata è evidenziata e le altre squadre della chat hanno il pin", () => {
    const rows = tableRows(SERIE_A.groups[0], INTER, ["108"]);

    expect(rows.map((r) => r.selected)).toEqual([false, true, false]);
    expect(rows.map((r) => r.otherPin)).toEqual([false, false, true]);
  });

  it("la legenda delle zone non ripete una zona", () => {
    expect(zoneLegend(SERIE_A.groups[0].rows).map((z) => z.label)).toEqual(["Champions League", "Relegated"]);
  });
});

describe("tab Classifica: percorso di una coppa", () => {
  it("una coppa senza tabella mostra le partite in ordine, col turno e il risultato", () => {
    const coppa = standings([], { league: "ita.coppa_italia", season: "2026-27 Coppa Italia" });
    const scheduleRows = schedule([
      match({ eventId: "r16", kickoff, league: "ita.coppa_italia", round: "Round of 16" }),
    ], [
      match({ eventId: "qf", kickoff: kickoff + 30 * day, league: "ita.coppa_italia", round: "Quarterfinals", state: "pre", score: undefined }),
    ]);

    const view = standingsView({ standings: coppa, schedule: scheduleRows, teamId: INTER, otherTeamIds: [] });
    expect(view.kind).toBe("path");
    if (view.kind !== "path") return;
    expect(view.steps.map((s) => [s.round, s.match.eventId])).toEqual([
      ["Round of 16", "r16"],
      ["Quarterfinals", "qf"],
    ]);
    expect(view.steps[0]).toMatchObject({ outcome: "win", score: "2–1", opens: true });
    expect(view.steps[1]).toMatchObject({ outcome: null, score: null, opens: false });
  });

  it("senza tabella e senza partite non mostra niente", () => {
    const coppa = standings([], { league: "ita.coppa_italia", season: "2026-27 Coppa Italia" });
    expect(standingsView({ standings: coppa, schedule: schedule([]), teamId: INTER, otherTeamIds: [] }).kind).toBe("empty");
  });
});

describe("tab Classifica: coppa oltre la fase campionato", () => {
  it("mostra le gare a eliminazione sopra la tabella finale", () => {
    const ucl = standings(
      [{ name: "League Phase", rows: [row({ teamId: INTER, rank: 5, points: 12 })] }],
      { league: "uefa.champions", season: "2026-27 UEFA Champions League" },
    );
    const scheduleRows = schedule([
      match({ eventId: "league", kickoff, league: "uefa.champions", round: "League Phase" }),
      match({ eventId: "r16", kickoff: kickoff + 120 * day, league: "uefa.champions", round: "Round of 16", state: "pre", score: undefined }),
    ]);

    const view = standingsView({ standings: ucl, schedule: scheduleRows, teamId: INTER, otherTeamIds: [] });
    expect(view.kind).toBe("knockout");
    if (view.kind !== "knockout") return;
    expect(view.steps.map((s) => s.round)).toEqual(["Round of 16"]);
    expect(view.rows.map((r) => r.teamId)).toEqual([INTER]);
    expect(knockoutSteps([match({ eventId: "final", kickoff, league: "uefa.champions", round: "Final" })]).map((s) => s.round)).toEqual(["Final"]);
    expect(pathSteps([match({ eventId: "league", kickoff, league: "uefa.champions", round: "League Phase" })])).toHaveLength(0);
  });

  it("una tabella di campionato non tratta il turno come un'eliminazione", () => {
    const scheduleRows = schedule([match({ eventId: "sa", kickoff, league: "ita.1" })]);
    expect(standingsView({ standings: SERIE_A, schedule: scheduleRows, teamId: INTER, otherTeamIds: [] }).kind).toBe("table");
  });
});

describe("tab Classifica: quali competizioni", () => {
  const competitions: Competition[] = [
    { league: "ita.1", name: "Italian Serie A", shortName: "Serie A", season: "2026-27 Italian Serie A" },
    { league: "uefa.champions", name: "UEFA Champions League", shortName: "UCL", season: "2026-27 UEFA Champions League" },
    { league: "ita.coppa_italia", name: "Coppa Italia", shortName: "Coppa Italia", season: "2026-27 Coppa Italia" },
  ];

  it("si apre sulla competizione della partita del chip", () => {
    expect(initialLeague(competitions, "uefa.champions")).toBe("uefa.champions");
  });

  it("se la partita del chip è un'amichevole si apre sul campionato della squadra", () => {
    expect(initialLeague(competitions, "club.friendly")).toBe("ita.1");
    expect(initialLeague(competitions, undefined)).toBe("ita.1");
  });

  it("senza competizioni non c'è una scelta", () => {
    expect(initialLeague([], "ita.1")).toBeNull();
  });
});

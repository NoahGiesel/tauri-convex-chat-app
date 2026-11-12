import { describe, expect, it } from "vitest";
import {
  fallbackLeague,
  initialLeague,
  leagueChoice,
  leagueRequest,
  pathSteps,
  standingsView,
  tableRows,
  teamLeague,
  waitingTooLong,
  zoneLegend,
  type Competition,
  type StandingsGroup,
  type TeamStandings,
} from "./match-standings";
import type { ScheduleMatch, TeamSchedule } from "./match-schedule";

const minute = 60_000;
const day = 24 * 60 * minute;
const kickoff = Date.parse("2026-11-08T17:00Z");
const INTER = "110";
const ITALY = "162";

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
    groupCount: groups.length,
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

function competition(league: string): Competition {
  return { league, name: league, shortName: league, season: `2026-27 ${league}` };
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
  it("una coppa senza tabella mostra tutte le partite in ordine, qualunque sia il nome del turno", () => {
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

  it("il percorso di una coppa tiene anche un turno che non sembra a eliminazione", () => {
    const superCup = standings([], { league: "ita.super_cup", season: "2026 Italian Supercoppa" });
    const scheduleRows = schedule([
      match({ eventId: "super", kickoff, league: "ita.super_cup", round: "2026 Italian Supercoppa" }),
    ]);

    const view = standingsView({ standings: superCup, schedule: scheduleRows, teamId: INTER, otherTeamIds: [] });
    expect(view.kind).toBe("path");
    if (view.kind !== "path") return;
    expect(view.steps.map((s) => s.round)).toEqual(["2026 Italian Supercoppa"]);
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
  });

  it("una tabella di campionato non tratta il turno come un'eliminazione", () => {
    const scheduleRows = schedule([match({ eventId: "sa", kickoff, league: "ita.1" })]);
    expect(standingsView({ standings: SERIE_A, schedule: scheduleRows, teamId: INTER, otherTeamIds: [] }).kind).toBe("table");
  });

  it("una competizione a gironi tiene il suo girone anche dopo la fase a gironi", () => {
    // Le qualificazioni mondiali hanno dodici gironi: il tab mostra solo quello della squadra,
    // senza la testata "Fase campionato · finale" che spetta a una fase campionato unica.
    const groups = standings(
      [{ name: "Group A", rows: [row({ teamId: ITALY, rank: 2 })] }],
      { league: "fifa.worldq.uefa", season: "2026 World Cup Qualifying - UEFA", groupCount: 12 },
    );
    const scheduleRows = schedule([
      match({ eventId: "group", kickoff, league: "fifa.worldq.uefa", round: "Group A" }),
      match({ eventId: "playoff", kickoff: kickoff + 30 * day, league: "fifa.worldq.uefa", round: "Playoff Finals", state: "pre", score: undefined }),
    ]);

    const view = standingsView({ standings: groups, schedule: scheduleRows, teamId: ITALY, otherTeamIds: [] });
    expect(view.kind).toBe("table");
    if (view.kind !== "table") return;
    expect(view.rows.map((r) => r.teamId)).toEqual([ITALY]);
  });

  it("il percorso senza tabella non filtra per nome del turno", () => {
    expect(pathSteps([match({ eventId: "league", kickoff, league: "uefa.champions", round: "League Phase" })])).toHaveLength(1);
  });
});

describe("tab Classifica: quali competizioni", () => {
  const competitions: Competition[] = [
    { league: "ita.coppa_italia", name: "Coppa Italia", shortName: "Coppa Italia", season: "2026-27 Coppa Italia" },
    { league: "uefa.champions", name: "UEFA Champions League", shortName: "UCL", season: "2026-27 UEFA Champions League" },
    { league: "ita.1", name: "Italian Serie A", shortName: "Serie A", season: "2026-27 Italian Serie A" },
  ];
  const scheduleRows = schedule([
    ...Array.from({ length: 11 }, (_, i) => match({ eventId: `sa-${i}`, kickoff: kickoff - i * day, league: "ita.1" })),
    match({ eventId: "cup", kickoff, league: "ita.coppa_italia", round: "Round of 16" }),
  ]);

  it("si apre sulla competizione della partita del chip", () => {
    expect(initialLeague(competitions, "uefa.champions", "ita.1")).toBe("uefa.champions");
  });

  it("la squadra ha il campionato nelle partite, non nell'ordine dei chip", () => {
    expect(teamLeague(scheduleRows, competitions)).toBe("ita.1");
  });

  it("se la partita del chip è un'amichevole si apre sul campionato della squadra", () => {
    expect(initialLeague(competitions, "club.friendly", "ita.1")).toBe("ita.1");
    expect(initialLeague(competitions, undefined, "ita.1")).toBe("ita.1");
  });

  it("se la competizione del chip non ha niente da mostrare si apre sul campionato", () => {
    expect(fallbackLeague("uefa.champions", true, "ita.1")).toBe("ita.1");
    expect(fallbackLeague("uefa.champions", false, "ita.1")).toBe("uefa.champions");
    expect(fallbackLeague("ita.1", true, "ita.1")).toBe("ita.1");
  });

  it("senza competizioni non c'è una scelta", () => {
    expect(initialLeague([], "ita.1", null)).toBeNull();
    expect(teamLeague(schedule([]), [])).toBeNull();
  });
});

describe("tab Classifica: la competizione dopo un cambio squadra", () => {
  const ucl = competition("uefa.champions");
  const serieA = competition("ita.1");
  const coppa = competition("ita.coppa_italia");
  /** Inter gioca anche la Champions; Milan no: è la squadra che resta senza la competizione scelta. */
  const inter = [coppa, ucl, serieA];
  const milan = [coppa, serieA];

  it("se la squadra mostrata non gioca la competizione scelta, la scelta cade e il tab torna a quella del derby", () => {
    const { picked, requested } = leagueRequest("uefa.champions", "ita.1", milan, "ita.1", false);

    expect(picked).toBeNull();
    expect(requested).toBe("ita.1");
    expect(leagueChoice(requested, false, "ita.1", picked)).toEqual({ league: "ita.1", usingFallback: false });
  });

  it("la competizione che giocano entrambe le squadre resta scelta", () => {
    const { picked, requested } = leagueRequest("uefa.champions", "ita.1", inter, "ita.1", false);

    expect(picked).toBe("uefa.champions");
    expect(requested).toBe("uefa.champions");
    expect(leagueChoice(requested, false, "ita.1", picked)).toEqual({ league: "uefa.champions", usingFallback: false });
  });

  it("tornando alla prima squadra resta la competizione del derby", () => {
    const switched = leagueRequest("uefa.champions", "ita.1", milan, "ita.1", false);
    expect(switched.picked).toBeNull();

    const back = leagueRequest(switched.picked, "ita.1", inter, "ita.1", false);

    expect(back.requested).toBe("ita.1");
    expect(leagueChoice(back.requested, false, "ita.1", back.picked).league).toBe("ita.1");
  });

  it("mentre il calendario della squadra mostrata carica, la richiesta non oscilla", () => {
    expect(leagueRequest("uefa.champions", "ita.1", [], "ita.1", true)).toEqual({
      picked: "uefa.champions",
      requested: "uefa.champions",
    });
  });

  it("quando la competizione del derby non ha niente da mostrare, il tab ripiega sul campionato", () => {
    const { picked, requested } = leagueRequest(null, "ita.coppa_italia", milan, "ita.1", false);
    expect(requested).toBe("ita.coppa_italia");

    expect(leagueChoice(requested, true, "ita.1", picked)).toEqual({ league: "ita.1", usingFallback: true });
  });

  it("una competizione scelta coi chip resta accesa anche senza niente da mostrare", () => {
    const { picked, requested } = leagueRequest("ita.coppa_italia", "ita.1", inter, "ita.1", false);
    expect(requested).toBe("ita.coppa_italia");

    expect(leagueChoice(requested, true, "ita.1", picked)).toEqual({ league: "ita.coppa_italia", usingFallback: false });
  });
});

describe("tab Classifica: una sola squadra", () => {
  const competitions: Competition[] = [
    { league: "uefa.champions", name: "UEFA Champions League", shortName: "UCL", season: "2026-27 UEFA Champions League" },
    { league: "ita.1", name: "Italian Serie A", shortName: "Serie A", season: "2026-27 Italian Serie A" },
  ];

  it("si apre sulla competizione della partita e la scelta fatta resta", () => {
    const initial = leagueRequest(null, "uefa.champions", competitions, "ita.1", false);
    expect(initial.requested).toBe("uefa.champions");
    expect(leagueChoice(initial.requested, false, "ita.1", initial.picked)).toEqual({ league: "uefa.champions", usingFallback: false });

    const picked = leagueRequest("ita.1", "uefa.champions", competitions, "ita.1", false);
    expect(picked.requested).toBe("ita.1");
    expect(leagueChoice(picked.requested, false, "ita.1", picked.picked)).toEqual({ league: "ita.1", usingFallback: false });
  });

  it("senza competizione della partita si apre sul campionato della squadra", () => {
    expect(leagueRequest(null, undefined, competitions, "ita.1", false).requested).toBe("ita.1");
  });
});

describe("tab Classifica: prima richiesta fallita", () => {
  it("smette di caricare quando la classifica non è mai arrivata e il calendario è vecchio", () => {
    const pending = { pending: true };
    const fresh = { fetchedAt: kickoff };
    expect(waitingTooLong(pending, fresh, kickoff + 3 * minute)).toBe(true);
    expect(waitingTooLong(pending, fresh, kickoff + 1 * minute)).toBe(false);
    expect(waitingTooLong({ pending: false }, fresh, kickoff + 3 * minute)).toBe(false);
    expect(waitingTooLong(pending, null, kickoff + 3 * minute)).toBe(false);
  });
});

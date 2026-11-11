import { describe, expect, it } from "vitest";
import type { Doc } from "../../convex/_generated/dataModel";
import { pitchView, playerMarks } from "./match-pitch";

type Lineups = Doc<"footballMatchDetails">["lineups"];
type Events = Doc<"footballMatchDetails">["events"];

/** Un undici con i posti già calcolati dal parser, come li salva il riassunto. */
function lineup(side: "home" | "away"): Lineups[number] {
  const prefix = side === "home" ? "h" : "a";
  return {
    side,
    formation: "4-2-3-1",
    starters: [
      { name: "Portiere", shortName: "Portiere", jersey: "1", athleteId: `${prefix}1`, row: 0, order: 0 },
      { name: "Terzino sinistro", shortName: "T. sinistro", jersey: "3", athleteId: `${prefix}2`, row: 1, order: 0 },
      { name: "Difensore centrale", shortName: "D. centrale", jersey: "6", athleteId: `${prefix}3`, row: 1, order: 1 },
      { name: "Altro centrale", shortName: "A. centrale", jersey: "5", athleteId: `${prefix}4`, row: 1, order: 2 },
      { name: "Terzino destro", shortName: "T. destro", jersey: "2", athleteId: `${prefix}5`, row: 1, order: 3 },
      { name: "Mediano sinistro", shortName: "M. sinistro", jersey: "4", athleteId: `${prefix}6`, row: 2, order: 0 },
      { name: "Mediano destro", shortName: "M. destro", jersey: "8", athleteId: `${prefix}7`, row: 2, order: 1 },
      { name: "Trequartista sinistro", shortName: "T. sinistro", jersey: "11", athleteId: `${prefix}8`, row: 3, order: 0 },
      { name: "Trequartista", shortName: "Trequartista", jersey: "10", athleteId: `${prefix}9`, row: 3, order: 1 },
      { name: "Trequartista destro", shortName: "T. destro", jersey: "7", athleteId: `${prefix}10`, row: 3, order: 2 },
      { name: "Attaccante", shortName: "Attaccante", jersey: "9", athleteId: `${prefix}11`, row: 4, order: 0 },
    ],
    bench: [],
  };
}

describe("distesa delle formazioni sul campo", () => {
  it("ogni squadra ha le sue righe, dalla porta all'attacco, ordinate da sinistra a destra", () => {
    const view = pitchView([lineup("home"), lineup("away")])!;

    expect(view.home.formation).toBe("4-2-3-1");
    expect(view.home.rows.map((row) => row.map((p) => p.jersey))).toEqual([
      ["1"],
      ["3", "6", "5", "2"],
      ["4", "8"],
      ["11", "10", "7"],
      ["9"],
    ]);
    expect(view.home.rows[1][0]).toMatchObject({ athleteId: "h2", shortName: "T. sinistro" });
  });

  it("la trasferta sta in alto e ha la sinistra e la destra scambiate", () => {
    const view = pitchView([lineup("home"), lineup("away")])!;

    expect(view.away.rows.map((row) => row.map((p) => p.jersey))).toEqual([
      ["1"],
      ["2", "5", "6", "3"],
      ["8", "4"],
      ["7", "10", "11"],
      ["9"],
    ]);
    expect(view.away.rows[1].map((p) => p.athleteId)).toEqual(["a5", "a4", "a3", "a2"]);
  });

  it("senza posti per tutti non c'è una distesa: restano le liste", () => {
    const home = lineup("home");
    delete home.starters[3].row;
    expect(pitchView([home, lineup("away")])).toBeNull();
    expect(pitchView([lineup("home")])).toBeNull();
    expect(pitchView([])).toBeNull();
  });

  it("il nome corto del giocatore cade sul nome intero quando manca", () => {
    const home = lineup("home");
    delete home.starters[0].shortName;
    const view = pitchView([home, lineup("away")])!;
    expect(view.home.rows[0][0]).toMatchObject({ name: "Portiere", shortName: "Portiere" });
  });
});

describe("distintivi agganciati al giocatore", () => {
  const events: Events = [
    { kind: "goal", minute: "12'", side: "home", player: "Pio", playerId: "pio" },
    { kind: "penaltyGoal", minute: "30'", side: "home", player: "Pio", playerId: "pio" },
    { kind: "ownGoal", minute: "35'", side: "home", player: "Sfortunato", playerId: "altro" },
    { kind: "yellowCard", minute: "40'", side: "away", player: "Ammonito", playerId: "ammonito" },
    { kind: "redCard", minute: "80'", side: "home", player: "Pio", playerId: "pio" },
    { kind: "substitution", minute: "61'", side: "away", player: "Entrato", other: "Uscito", playerId: "entrato", otherId: "uscito" },
    { kind: "goal", minute: "70'", side: "home", player: "Pio" },
  ];

  it("conta i gol, le ammonizioni e l'uscita di un titolare", () => {
    expect(playerMarks(events, "home", "pio")).toEqual({ goals: 2, yellow: false, red: true, off: undefined, on: undefined });
    expect(playerMarks(events, "away", "uscito")).toMatchObject({ off: "61'" });
    expect(playerMarks(events, "away", "ammonito")).toMatchObject({ yellow: true, goals: 0 });
  });

  it("chi entra si porta dietro il minuto e chi ha sostituito", () => {
    expect(playerMarks(events, "away", "entrato")).toMatchObject({ on: { minute: "61'", other: "Uscito" } });
  });

  it("un evento senza id non si aggancia, e un id sconosciuto non ha distintivi", () => {
    expect(playerMarks(events, "home", "sconosciuto")).toEqual({ goals: 0, yellow: false, red: false, off: undefined, on: undefined });
    expect(playerMarks(events, "home")).toEqual({ goals: 0, yellow: false, red: false, off: undefined, on: undefined });
    expect(playerMarks(events, "home", "altro")).toEqual({ goals: 0, yellow: false, red: false, off: undefined, on: undefined });
  });
});

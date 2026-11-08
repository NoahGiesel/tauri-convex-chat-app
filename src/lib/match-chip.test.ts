import { describe, expect, it } from "vitest";
import { chipState, isUnavailable, shownMatch, type PinMatch } from "./match-chip";

const side = (abbreviation: string) => ({ teamId: abbreviation, name: abbreviation, shortName: abbreviation, abbreviation, logo: null });

/** Ore locali (il chip ragiona nell'ora di chi guarda). */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();

function match(patch: Partial<PinMatch> = {}): PinMatch {
  return {
    eventId: "1",
    kickoff: at(8, 20, 45),
    state: "pre",
    statusName: "STATUS_SCHEDULED",
    home: side("INT"),
    away: side("COM"),
    score: null,
    shootout: null,
    clock: null,
    fetchedAt: at(8, 20, 0),
    ...patch,
  };
}

const finished = (patch: Partial<PinMatch> = {}) =>
  match({ eventId: "last", state: "post", statusName: "STATUS_FULL_TIME", score: { home: 2, away: 1 }, ...patch });

describe("quale partita mostra il chip", () => {
  it("la partita finita resta fino alle 6 del mattino dopo, poi c'è la prossima", () => {
    const pin = { lastMatch: finished(), nextMatch: match({ eventId: "next", kickoff: at(15, 18) }) };
    expect(shownMatch(pin, at(8, 23))?.eventId).toBe("last");
    expect(shownMatch(pin, at(9, 5, 59))?.eventId).toBe("last");
    expect(shownMatch(pin, at(9, 6))?.eventId).toBe("next");
  });

  it("la prossima prende il posto della finita appena è a meno di 60 minuti", () => {
    const pin = { lastMatch: finished(), nextMatch: match({ eventId: "next", kickoff: at(9, 1) }) };
    expect(shownMatch(pin, at(8, 23, 59))?.eventId).toBe("last");
    expect(shownMatch(pin, at(9, 0, 1))?.eventId).toBe("next");
  });

  it("una partita in corso si mostra sempre", () => {
    const pin = { lastMatch: finished(), nextMatch: match({ eventId: "next", state: "in", statusName: "STATUS_FIRST_HALF", kickoff: at(8, 23) }) };
    expect(shownMatch(pin, at(8, 23, 10))?.eventId).toBe("next");
  });

  it("una partita rinviata resta fino a 3 ore dopo il calcio d'inizio previsto", () => {
    const pin = {
      lastMatch: finished({ statusName: "STATUS_POSTPONED", score: null, kickoff: at(8, 15) }),
      nextMatch: match({ eventId: "next", kickoff: at(12, 20) }),
    };
    expect(shownMatch(pin, at(8, 17, 59))?.eventId).toBe("last");
    expect(shownMatch(pin, at(8, 18))?.eventId).toBe("next");
  });

  it("una prossima partita già chiusa conta come ultima", () => {
    expect(shownMatch({ lastMatch: null, nextMatch: finished() }, at(8, 23))?.eventId).toBe("last");
    expect(shownMatch({ lastMatch: null, nextMatch: finished() }, at(9, 7))).toBeNull();
  });

  it("senza partite in programma non c'è partita", () => {
    expect(shownMatch({ lastMatch: null, nextMatch: null }, at(8, 12))).toBeNull();
    expect(shownMatch({ lastMatch: finished(), nextMatch: null }, at(10, 12))).toBeNull();
  });
});

describe("etichette", () => {
  it.each([
    [match(), { kind: "next" }],
    [match({ statusName: "STATUS_DELAYED" }), { kind: "delayed" }],
    [match({ state: "in", statusName: "STATUS_SECOND_HALF", score: { home: 1, away: 0 }, clock: "67'" }), { kind: "live", minute: "67'" }],
    [match({ state: "in", statusName: "STATUS_IN_PROGRESS", score: { home: 1, away: 1 }, clock: "105'" }), { kind: "live", minute: "105'" }],
    [match({ state: "in", statusName: "STATUS_HALFTIME", score: { home: 2, away: 0 } }), { kind: "halftime", score: { home: 2, away: 0 } }],
    [
      match({ state: "in", statusName: "STATUS_SHOOTOUT", score: { home: 1, away: 1 }, shootout: { home: 3, away: 2 } }),
      { kind: "shootout", shootout: { home: 3, away: 2 } },
    ],
    [finished(), { kind: "finished", ending: "ft", winner: "home" }],
    [finished({ statusName: "STATUS_FINAL_AET", score: { home: 0, away: 1 } }), { kind: "finished", ending: "aet", winner: "away" }],
    [
      finished({ statusName: "STATUS_FINAL_PEN", score: { home: 3, away: 3 }, shootout: { home: 4, away: 2 } }),
      { kind: "finished", ending: "pens", shootout: { home: 4, away: 2 }, winner: "home" },
    ],
    [match({ state: "in", statusName: "STATUS_SUSPENDED", score: { home: 1, away: 0 } }), { kind: "suspended", score: { home: 1, away: 0 } }],
    [finished({ statusName: "STATUS_ABANDONED" }), { kind: "abandoned", score: { home: 2, away: 1 } }],
    [finished({ statusName: "STATUS_POSTPONED", score: null }), { kind: "postponed" }],
    [match({ statusName: "STATUS_CANCELED" }), { kind: "cancelled" }],
  ])("%#: %o", (m, expected) => {
    expect(chipState(m)).toMatchObject(expected);
  });

  it("un pareggio finito non ha vincitore", () => {
    expect(chipState(finished({ score: { home: 1, away: 1 } }))).toMatchObject({ winner: null });
  });
});

describe("dato non disponibile", () => {
  it("una partita in corso senza aggiornamenti da più di 2 minuti", () => {
    const live = match({ state: "in", statusName: "STATUS_FIRST_HALF", score: { home: 0, away: 0 }, fetchedAt: at(8, 21) });
    expect(isUnavailable(live, at(8, 21, 2))).toBe(false);
    expect(isUnavailable(live, at(8, 21, 2) + 1)).toBe(true);
  });

  it("una prossima partita senza aggiornamenti da più di 12 ore", () => {
    const next = match({ fetchedAt: at(8, 6) });
    expect(isUnavailable(next, at(8, 18))).toBe(false);
    expect(isUnavailable(next, at(8, 18) + 1)).toBe(true);
  });

  it("una partita finita non scade", () => {
    expect(isUnavailable(finished({ fetchedAt: at(1, 0) }), at(8, 12))).toBe(false);
  });
});

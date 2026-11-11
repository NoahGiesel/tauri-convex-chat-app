import { describe, expect, it } from "vitest";
import { isStale } from "./match-drawer";
import { competitionTag, matchOutcome, matchesTab, rowTail, scoreLine, type ScheduleMatch } from "./match-schedule";

const day = 24 * 60 * 60_000;
const kickoff = Date.parse("2026-11-08T17:00Z");

/** Una riga del calendario, con i campi che il test non tocca già pieni. */
function row(over: Partial<ScheduleMatch> & Pick<ScheduleMatch, "eventId" | "kickoff">): ScheduleMatch {
  return {
    league: "ita.1",
    leagueName: "Serie A",
    round: "2026-27 Italian Serie A",
    opponent: { teamId: "103", name: "AC Milan", shortName: "Milan", abbreviation: "MIL" },
    home: true,
    state: "post",
    score: { home: 1, away: 0 },
    ...over,
  };
}

/** Partite finite di fila, dalla più vecchia alla più recente. */
function results(count: number, over: Partial<ScheduleMatch> = {}): ScheduleMatch[] {
  return Array.from({ length: count }, (_, i) => row({ eventId: `result-${i}`, kickoff: kickoff - (count - i) * day, ...over }));
}

describe("tab Partite: quali partite mostra", () => {
  it("mostra le prossime 3 partite, dalla più vicina", () => {
    const fixtures = [
      row({ eventId: "c", kickoff: kickoff + 3 * day, state: "pre", score: undefined }),
      row({ eventId: "a", kickoff: kickoff + day, state: "pre", score: undefined }),
      row({ eventId: "d", kickoff: kickoff + 4 * day, state: "pre", score: undefined }),
      row({ eventId: "b", kickoff: kickoff + 2 * day, state: "pre", score: undefined }),
    ];
    expect(matchesTab({ results: [], fixtures }).next.map((m) => m.eventId)).toEqual(["a", "b", "c"]);
  });

  it("mostra gli ultimi 10 risultati, dal più recente", () => {
    const all = results(12);
    expect(matchesTab({ results: all, fixtures: [] }).recent.map((m) => m.eventId)).toEqual(
      all.slice(2).reverse().map((m) => m.eventId),
    );
  });

  it("toglie le amichevoli dai risultati e dalle prossime partite", () => {
    const all = [
      ...results(2),
      row({ eventId: "club-friendly", kickoff: kickoff - 3 * day, league: "club.friendly" }),
      row({ eventId: "national-friendly", kickoff: kickoff - 4 * day, league: "fifa.friendly" }),
    ];
    const fixtures = [
      row({ eventId: "friendly", kickoff: kickoff + day, league: "club.friendly", state: "pre", score: undefined }),
      row({ eventId: "serie-a", kickoff: kickoff + 2 * day, state: "pre", score: undefined }),
    ];
    const tab = matchesTab({ results: all, fixtures });
    expect(tab.recent.map((m) => m.eventId)).toEqual(["result-1", "result-0"]);
    expect(tab.next.map((m) => m.eventId)).toEqual(["serie-a"]);
  });

  it("senza partite dà due liste vuote", () => {
    expect(matchesTab({ results: [], fixtures: [] })).toEqual({ next: [], recent: [] });
  });
});

describe("tab Partite: risultato e punteggio", () => {
  it("la vittoria, il pareggio e la sconfitta si leggono dal lato della squadra", () => {
    expect(matchOutcome(row({ eventId: "w", kickoff, home: true, score: { home: 2, away: 1 } }))).toBe("win");
    expect(matchOutcome(row({ eventId: "d", kickoff, home: true, score: { home: 1, away: 1 } }))).toBe("draw");
    expect(matchOutcome(row({ eventId: "l", kickoff, home: true, score: { home: 0, away: 3 } }))).toBe("loss");
    expect(matchOutcome(row({ eventId: "aw", kickoff, home: false, score: { home: 1, away: 2 } }))).toBe("win");
    expect(matchOutcome(row({ eventId: "al", kickoff, home: false, score: { home: 2, away: 0 } }))).toBe("loss");
  });

  it("una partita decisa ai rigori è una vittoria o una sconfitta, non un pareggio", () => {
    // Italia fuori ai play-off: 1–1 dopo i supplementari, 1–4 ai rigori, in trasferta.
    const away = row({
      eventId: "pens-away",
      kickoff,
      home: false,
      score: { home: 1, away: 1 },
      shootout: { home: 4, away: 1 },
      winner: "home",
    });
    expect(matchOutcome(away)).toBe("loss");
    const home = row({
      eventId: "pens-home",
      kickoff,
      home: true,
      score: { home: 1, away: 1 },
      shootout: { home: 3, away: 4 },
      winner: "away",
    });
    expect(matchOutcome(home)).toBe("loss");
    expect(matchOutcome({ ...home, home: false })).toBe("win");
  });

  it("una partita non ancora giocata non ha risultato", () => {
    expect(matchOutcome(row({ eventId: "next", kickoff, state: "pre", score: undefined }))).toBeNull();
  });

  it("il punteggio è quello della squadra per prima, col punteggio dei rigori fra parentesi", () => {
    expect(scoreLine(row({ eventId: "home", kickoff, home: true, score: { home: 2, away: 0 } }))).toBe("2–0");
    expect(scoreLine(row({ eventId: "away", kickoff, home: false, score: { home: 3, away: 1 } }))).toBe("1–3");
    expect(
      scoreLine(
        row({ eventId: "pens", kickoff, home: false, score: { home: 1, away: 1 }, shootout: { home: 2, away: 4 } }),
      ),
    ).toBe("1–1 (4–2)");
    expect(scoreLine(row({ eventId: "next", kickoff, state: "pre", score: undefined }))).toBeNull();
  });

  it("una prossima partita senza orario fissato mostra solo la data, senza ora", () => {
    expect(rowTail(row({ eventId: "fixed", kickoff, state: "pre", score: undefined, timeValid: true }), "20:45")).toBe("20:45");
    expect(rowTail(row({ eventId: "unknown", kickoff, state: "pre", score: undefined, timeValid: undefined }), "20:45")).toBe("20:45");
    expect(rowTail(row({ eventId: "tbd", kickoff, state: "pre", score: undefined, timeValid: false }), "20:45")).toBe("");
    expect(rowTail(row({ eventId: "played", kickoff, score: { home: 2, away: 0 } }), "20:45")).toBe("2–0");
  });
});

describe("tab Partite: tag della competizione", () => {
  it("usa la sigla corta della competizione", () => {
    expect(competitionTag("ita.1", "Serie A")).toBe("SA");
    expect(competitionTag("uefa.champions", "UEFA Champions League")).toBe("UCL");
    expect(competitionTag("ita.coppa_italia", "Coppa Italia")).toBe("CI");
  });

  it("per una competizione che non conosce usa le iniziali del nome", () => {
    expect(competitionTag("eng.2", "English League Championship")).toBe("ELC");
  });
});

describe("tab Partite: dati vecchi", () => {
  it("mostra l'ultimo aggiornamento solo dopo 24 ore", () => {
    expect(isStale(kickoff, kickoff + day)).toBe(false);
    expect(isStale(kickoff, kickoff + day + 1)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { PinMatch } from "./match-chip";
import { teamChips, type TeamPin } from "./team-pins";

const side = (teamId: string, abbreviation: string) => ({ teamId, name: abbreviation, shortName: abbreviation, abbreviation, logo: null });
const NOW = Date.parse("2026-11-08T12:00Z");

function game(eventId: string, home: string, away: string, patch: Partial<PinMatch> = {}): PinMatch {
  return {
    eventId,
    kickoff: NOW + 86_400_000,
    state: "pre",
    statusName: "STATUS_SCHEDULED",
    home: side(home, home),
    away: side(away, away),
    score: null,
    shootout: null,
    clock: null,
    fetchedAt: NOW,
    ...patch,
  };
}

function pin(teamId: string, abbreviation: string, nextMatch: PinMatch | null, lastMatch: PinMatch | null = null): TeamPin {
  return { pinId: `pin-${teamId}` as Id<"teamPins">, pinnedAt: 0, team: side(teamId, abbreviation), lastMatch, nextMatch };
}

describe("chip delle squadre pinnate", () => {
  it("un chip per squadra, nell'ordine dei pin", () => {
    const chips = teamChips([pin("110", "INT", game("1", "105", "110")), pin("114", "NAP", game("2", "114", "112"))], NOW);
    expect(chips.map((c) => c.key)).toEqual(["1", "2"]);
  });

  it("un derby tra due squadre pinnate sta in un solo chip con entrambi i pin", () => {
    const derby = game("9", "103", "111");
    const chips = teamChips([pin("103", "MIL", derby), pin("110", "INT", game("1", "105", "110")), pin("111", "JUV", derby)], NOW);
    expect(chips.map((c) => [c.key, c.pins.map((p) => p.team.abbreviation)])).toEqual([
      ["9", ["MIL", "JUV"]],
      ["1", ["INT"]],
    ]);
  });

  it("dopo il derby, finita la sua giornata, ognuna torna al suo chip", () => {
    const derby = game("9", "103", "111", { state: "post", statusName: "STATUS_FULL_TIME", score: { home: 1, away: 1 }, kickoff: NOW - 3 * 86_400_000 });
    const chips = teamChips([pin("103", "MIL", game("10", "103", "4"), derby), pin("111", "JUV", game("11", "5", "111"), derby)], NOW);
    expect(chips.map((c) => c.key)).toEqual(["10", "11"]);
  });

  it("una squadra senza partite in programma ha il suo chip senza partita", () => {
    expect(teamChips([pin("162", "ITA", null)], NOW)).toMatchObject([{ key: "team-162", match: null }]);
  });
});

import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { teamChips, type TeamPin } from "./team-pins";

const side = (teamId: string, abbreviation: string) => ({ teamId, name: abbreviation, shortName: abbreviation, abbreviation, logo: null });

function pin(teamId: string, abbreviation: string, next: { eventId: string; home: string; away: string } | null): TeamPin {
  return {
    pinId: `pin-${teamId}` as Id<"teamPins">,
    pinnedAt: 0,
    team: side(teamId, abbreviation),
    nextMatch: next && {
      eventId: next.eventId,
      kickoff: 0,
      state: "pre",
      statusName: "STATUS_SCHEDULED",
      home: side(next.home, next.home),
      away: side(next.away, next.away),
      fetchedAt: 0,
    },
  };
}

describe("chip delle squadre pinnate", () => {
  it("un chip per squadra, nell'ordine dei pin", () => {
    const chips = teamChips([pin("110", "INT", { eventId: "1", home: "105", away: "110" }), pin("114", "NAP", { eventId: "2", home: "114", away: "112" })]);
    expect(chips.map((c) => c.key)).toEqual(["1", "2"]);
  });

  it("un derby tra due squadre pinnate sta in un solo chip con entrambi i pin", () => {
    const chips = teamChips([
      pin("103", "MIL", { eventId: "9", home: "103", away: "111" }),
      pin("110", "INT", { eventId: "1", home: "105", away: "110" }),
      pin("111", "JUV", { eventId: "9", home: "103", away: "111" }),
    ]);
    expect(chips.map((c) => [c.key, c.pins.map((p) => p.team.abbreviation)])).toEqual([
      ["9", ["MIL", "JUV"]],
      ["1", ["INT"]],
    ]);
  });

  it("una squadra senza partite in programma ha il suo chip senza partita", () => {
    const chips = teamChips([pin("162", "ITA", null)]);
    expect(chips).toMatchObject([{ key: "team-162", match: null }]);
  });
});

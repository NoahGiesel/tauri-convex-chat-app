import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { shownMatch, type PinMatch } from "./match-chip";

export type TeamPin = FunctionReturnType<typeof api.teamPins.list>[number];

/** Un chip della fila: una partita (con una o due squadre pinnate, nel derby) o una squadra senza partite in programma. */
export type TeamChip = { key: string; pins: TeamPin[]; match: PinMatch | null };

/**
 * I chip della fila adesso, nell'ordine dei pin. Due squadre pinnate che mostrano la stessa partita
 * (un derby) stanno in un solo chip; contano comunque come due pin. Prima e dopo il derby ognuna ha il suo.
 */
export function teamChips(pins: TeamPin[], now: number): TeamChip[] {
  const chips: TeamChip[] = [];
  const byEvent = new Map<string, TeamChip>();
  for (const pin of pins) {
    const match = shownMatch(pin, now);
    const shared = match ? byEvent.get(match.eventId) : undefined;
    if (shared) {
      shared.pins.push(pin);
      continue;
    }
    const chip: TeamChip = { key: match?.eventId ?? `team-${pin.team.teamId}`, pins: [pin], match };
    if (match) byEvent.set(match.eventId, chip);
    chips.push(chip);
  }
  return chips;
}

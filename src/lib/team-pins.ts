import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

/** `/calcio` si vede solo in sviluppo e nella build di test, finché le squadre pinnate non escono (docs/TEAM-PINS-SPEC.md, Release gate). */
export const TEAM_PINS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_E2E === "1";

export type TeamPin = FunctionReturnType<typeof api.teamPins.list>[number];
export type NextMatch = NonNullable<TeamPin["nextMatch"]>;

/** Un chip della fila: una partita (con una o due squadre pinnate, nel derby) o una squadra senza partite in programma. */
export type TeamChip = { key: string; pins: TeamPin[]; match: NextMatch | null };

/**
 * I chip della fila, nell'ordine dei pin. Due squadre pinnate che giocano tra loro
 * (stessa prossima partita) stanno in un solo chip; contano comunque come due pin.
 */
export function teamChips(pins: TeamPin[]): TeamChip[] {
  const chips: TeamChip[] = [];
  const byEvent = new Map<string, TeamChip>();
  for (const pin of pins) {
    const eventId = pin.nextMatch?.eventId;
    const shared = eventId ? byEvent.get(eventId) : undefined;
    if (shared) {
      shared.pins.push(pin);
      continue;
    }
    const chip: TeamChip = { key: eventId ?? `team-${pin.team.teamId}`, pins: [pin], match: pin.nextMatch };
    if (eventId) byEvent.set(eventId, chip);
    chips.push(chip);
  }
  return chips;
}

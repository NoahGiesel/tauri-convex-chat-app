import type { TeamView } from "./match-schedule";
import type { Competition } from "./match-standings";

/**
 * La squadra che il drawer mostra: quella scelta con lo scambio, altrimenti quella pinnata per prima.
 * Se quella scelta non c'è più (il chip si è diviso) vale di nuovo la prima rimasta.
 */
export function drawerTeam(teams: readonly TeamView[], pickedTeamId: string | null): TeamView {
  return (pickedTeamId ? teams.find((team) => team.teamId === pickedTeamId) : undefined) ?? teams[0];
}

/**
 * La competizione del tab Classifica dopo un cambio squadra in un derby: resta quella scelta se anche
 * l'altra squadra la gioca, altrimenti torna alla competizione del derby (docs/MATCH-DRAWER-SPEC.md, Derby).
 * Finché le competizioni della nuova squadra non sono arrivate, torna comunque a quella del derby.
 */
export function keptLeague(chosen: string, derbyLeague: string, competitions: readonly Competition[]): string {
  return competitions.some((competition) => competition.league === chosen) ? chosen : derbyLeague;
}

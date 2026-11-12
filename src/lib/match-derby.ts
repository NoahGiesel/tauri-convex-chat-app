import type { TeamView } from "./match-schedule";

/**
 * La squadra che il drawer mostra: quella scelta con lo scambio, altrimenti quella pinnata per prima.
 * Se quella scelta non c'è più (il chip si è diviso) vale di nuovo la prima rimasta.
 */
export function drawerTeam(teams: readonly TeamView[], pickedTeamId: string | null): TeamView {
  return (pickedTeamId ? teams.find((team) => team.teamId === pickedTeamId) : undefined) ?? teams[0];
}

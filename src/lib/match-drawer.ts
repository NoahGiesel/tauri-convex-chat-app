import type { Id } from "../../convex/_generated/dataModel";
import type { TeamChip } from "./team-pins";

/** Larghezza del drawer (docs/MATCH-DRAWER-SPEC.md, Layout and closing). */
export const DRAWER_WIDTH = 380;
/** Sotto questa larghezza della colonna della chat il drawer copre invece di starci di fianco. */
const MIN_CHAT_COLUMN = 360;
/** Oltre un giorno i dati di un tab sono vecchi (docs/MATCH-DRAWER-SPEC.md, Loading, no data and stale data). */
const STALE_MS = 24 * 60 * 60_000;

/** Un tab mostra "Last updated" solo quando i suoi dati hanno più di 24 ore. */
export function isStale(fetchedAt: number, now: number): boolean {
  return now - fetchedAt > STALE_MS;
}

/** Le squadre pinnate che il drawer sta seguendo, nell'ordine in cui sono state pinnate. */
export type DrawerTarget = { teams: string[] };
export type DrawerLayout = "beside" | "cover";

/**
 * Di fianco alla chat se la colonna resta larga almeno 360px, altrimenti sopra la chat.
 * Nella finestra staccata copre sempre, anche allargandola.
 */
export function drawerLayout(containerWidth: number, popout: boolean): DrawerLayout {
  return popout || containerWidth - DRAWER_WIDTH < MIN_CHAT_COLUMN ? "cover" : "beside";
}

/** Gli id delle squadre di un chip, nell'ordine dei pin: il primo è quello che il drawer segue. */
export function teamIdsOf(chip: TeamChip): string[] {
  return chip.pins.map((pin) => pin.team.teamId);
}

/** Le squadre di un chip come bersaglio del drawer. */
export function targetOf(chip: TeamChip): DrawerTarget {
  return { teams: teamIdsOf(chip) };
}

/** Tiene solo le squadre ancora pinnate; `null` quando non ne resta nessuna. */
export function targetStillPinned(target: DrawerTarget, pinnedTeamIds: readonly string[]): DrawerTarget | null {
  const teams = target.teams.filter((teamId) => pinnedTeamIds.includes(teamId));
  if (teams.length === target.teams.length) return target;
  return teams.length > 0 ? { teams } : null;
}

/**
 * Il chip che il drawer mostra: quello della prima delle sue squadre ancora in fila.
 * `null` quando nessuna delle sue squadre è più pinnata.
 */
export function drawerChip(chips: TeamChip[], target: DrawerTarget | null): TeamChip | null {
  if (!target) return null;
  for (const teamId of target.teams) {
    const found = chips.find((chip) => teamIdsOf(chip).includes(teamId));
    if (found) return found;
  }
  return null;
}

/** Un clic su un chip: chiude se è il chip già aperto, altrimenti sposta il drawer su quel chip. */
export function toggleChip(chips: TeamChip[], target: DrawerTarget | null, chip: TeamChip): DrawerTarget | null {
  return drawerChip(chips, target) === chip ? null : targetOf(chip);
}

/** Cosa diventa il drawer quando si sa quali squadre sono ancora pinnate. */
export interface ResolvedDrawer {
  target: DrawerTarget | null;
  /** La memoria va aggiornata: le squadre del drawer sono cambiate o sono sparite tutte. */
  writeBack: boolean;
}

/**
 * Il drawer dopo un cambio di pin. `pinnedTeamIds` a `null` significa pin non ancora arrivati: il drawer
 * non si tocca. Quando una squadra sparisce il bersaglio si stringe, e a zero squadre il drawer si chiude.
 */
export function resolveTarget(stored: DrawerTarget | null, pinnedTeamIds: readonly string[] | null): ResolvedDrawer {
  if (stored === null) return { target: null, writeBack: false };
  if (pinnedTeamIds === null) return { target: stored, writeBack: false };
  const target = targetStillPinned(stored, pinnedTeamIds);
  return { target, writeBack: target !== stored };
}

export interface DrawerMemory {
  get(conversationId: Id<"conversations">): DrawerTarget | null;
  set(conversationId: Id<"conversations">, target: DrawerTarget | null): void;
  subscribe(conversationId: Id<"conversations">, listener: () => void): () => void;
}

/**
 * Il drawer aperto di ogni chat, solo in memoria: una finestra ha la sua, e dopo un riavvio
 * il drawer parte chiuso.
 */
export function createDrawerMemory(): DrawerMemory {
  const targets = new Map<Id<"conversations">, DrawerTarget>();
  const listeners = new Map<Id<"conversations">, Set<() => void>>();

  const notify = (conversationId: Id<"conversations">) => {
    for (const listener of listeners.get(conversationId) ?? []) listener();
  };

  return {
    get: (conversationId) => targets.get(conversationId) ?? null,
    set(conversationId, target) {
      const current = targets.get(conversationId) ?? null;
      if (current === target) return;
      if (target) targets.set(conversationId, target);
      else targets.delete(conversationId);
      notify(conversationId);
    },
    subscribe(conversationId, listener) {
      let set = listeners.get(conversationId);
      if (!set) {
        set = new Set();
        listeners.set(conversationId, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(conversationId);
      };
    },
  };
}

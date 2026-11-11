import { useEffect, useSyncExternalStore } from "react";
import type { TeamChip } from "./team-pins";

/** Larghezza del drawer (docs/MATCH-DRAWER-SPEC.md, Layout and closing). */
export const DRAWER_WIDTH = 380;
/** Sotto questa larghezza della colonna della chat il drawer copre invece di starci di fianco. */
export const MIN_CHAT_COLUMN = 360;

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

/** Le squadre di un chip, nell'ordine dei pin: la prima è quella che il drawer segue. */
export function targetOf(chip: TeamChip): DrawerTarget {
  return { teams: chip.pins.map((pin) => pin.team.teamId) };
}

/** Tiene solo le squadre ancora pinnate; `null` quando non ne resta nessuna. */
export function remainingPins(target: DrawerTarget, pinnedTeamIds: readonly string[]): DrawerTarget | null {
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
    const found = chips.find((chip) => chip.pins.some((pin) => pin.team.teamId === teamId));
    if (found) return found;
  }
  return null;
}

/** Un clic su un chip: chiude se è il chip già aperto, altrimenti sposta il drawer su quel chip. */
export function toggleChip(chips: TeamChip[], target: DrawerTarget | null, chip: TeamChip): DrawerTarget | null {
  return drawerChip(chips, target) === chip ? null : targetOf(chip);
}

export interface DrawerMemory {
  get(conversationId: string): DrawerTarget | null;
  set(conversationId: string, target: DrawerTarget | null): void;
  subscribe(conversationId: string, listener: () => void): () => void;
}

/**
 * Il drawer aperto di ogni chat, solo in memoria: una finestra ha la sua, e dopo un riavvio
 * il drawer parte chiuso.
 */
export function createDrawerMemory(): DrawerMemory {
  const targets = new Map<string, DrawerTarget>();
  const listeners = new Map<string, Set<() => void>>();

  const notify = (conversationId: string) => {
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

/** La memoria della finestra in cui gira l'app. */
const windowMemory = createDrawerMemory();

/**
 * Il drawer di una chat: quale chip mostra, se è aperto su un chip e come si apre, chiude o sposta.
 * Segue la squadra al chip successivo e si chiude da solo quando nessuna delle sue squadre è più pinnata.
 * `pinnedTeamIds` a `null` significa pin non ancora arrivati: in quel momento il drawer non si tocca.
 */
export function useMatchDrawer(conversationId: string, chips: TeamChip[], pinnedTeamIds: readonly string[] | null) {
  const stored = useSyncExternalStore(
    (listener) => windowMemory.subscribe(conversationId, listener),
    () => windowMemory.get(conversationId),
  );
  const target = stored && pinnedTeamIds ? remainingPins(stored, pinnedTeamIds) : stored;
  useEffect(() => {
    if (pinnedTeamIds && stored !== target) windowMemory.set(conversationId, target);
  }, [stored, target, pinnedTeamIds, conversationId]);

  const chip = drawerChip(chips, target);
  return {
    /** Il chip aperto, con la sua partita; `null` se il drawer è chiuso o nessuna squadra ha una partita. */
    chip: chip?.match ? chip : null,
    isOpen: (candidate: TeamChip) => chip === candidate,
    toggle: (clicked: TeamChip) => windowMemory.set(conversationId, toggleChip(chips, target, clicked)),
    close: () => windowMemory.set(conversationId, null),
  };
}

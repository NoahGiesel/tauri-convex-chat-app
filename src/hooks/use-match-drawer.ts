import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { createDrawerMemory, drawerChip, resolveTarget, toggleChip } from "@/lib/match-drawer";
import type { TeamChip } from "@/lib/team-pins";

/** La memoria della finestra in cui gira l'app: la finestra principale e quella staccata hanno la loro. */
const windowMemory = createDrawerMemory();

/**
 * Il drawer di una chat: quale chip mostra, se è aperto su un chip e come si apre, chiude o sposta.
 * Segue la squadra al chip successivo e si chiude da solo quando nessuna delle sue squadre è più pinnata.
 * `pinnedTeamIds` a `null` significa pin non ancora arrivati: in quel momento il drawer non si tocca.
 */
export function useMatchDrawer(
  conversationId: Id<"conversations">,
  chips: TeamChip[],
  pinnedTeamIds: readonly string[] | null,
) {
  const subscribe = useCallback(
    (listener: () => void) => windowMemory.subscribe(conversationId, listener),
    [conversationId],
  );
  const getSnapshot = useCallback(() => windowMemory.get(conversationId), [conversationId]);
  const stored = useSyncExternalStore(subscribe, getSnapshot);

  const { target, writeBack } = resolveTarget(stored, pinnedTeamIds);
  useEffect(() => {
    if (writeBack) windowMemory.set(conversationId, target);
  }, [writeBack, target, conversationId]);

  const chip = drawerChip(chips, target);
  return {
    /** Il chip aperto, con la sua partita; `null` se il drawer è chiuso o nessuna squadra ha una partita. */
    chip: chip?.match ? chip : null,
    isOpen: (candidate: TeamChip) => chip === candidate,
    toggle: (clicked: TeamChip) => windowMemory.set(conversationId, toggleChip(chips, target, clicked)),
    close: () => windowMemory.set(conversationId, null),
  };
}

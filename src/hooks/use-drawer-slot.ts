import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { drawerLayout, type DrawerLayout } from "@/lib/match-drawer";
import { popoutChatId } from "@/lib/popout";

/** Dove vive il drawer e come si dispone rispetto alla chat. */
export interface DrawerSlot {
  /** L'elemento accanto alla colonna della chat in cui il drawer compare. */
  slot: HTMLDivElement | null;
  layout: DrawerLayout;
}

/**
 * Misura la colonna della chat e dice se il drawer ci sta di fianco o la copre.
 * La prima misura è sincrona (`useLayoutEffect`): un drawer già aperto non nasce coperto per un fotogramma.
 */
export function useDrawerSlot(): {
  /** La riga della chat da misurare: messaggi e campo di scrittura, senza la fila dei chip. */
  rowRef: RefObject<HTMLDivElement | null>;
  /** La riga in cui portare il drawer, da assegnare al suo `<div>`. */
  attachSlot: (node: HTMLDivElement | null) => void;
  drawerSlot: DrawerSlot;
} {
  const rowRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const attachSlot = useCallback((node: HTMLDivElement | null) => setSlot(node), []);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    setWidth(row.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return {
    rowRef,
    attachSlot,
    drawerSlot: { slot, layout: drawerLayout(width, popoutChatId() !== null) },
  };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SidebarSide = "left" | "right";

export const SIDEBAR_MIN = 170;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 300;
/** Larghezza della barra compressa (solo avatar). */
export const SIDEBAR_RAIL = 76;

const STORAGE_KEY = "chat:sidebar";

interface SidebarPrefs {
  width: number;
  collapsed: boolean;
  /** Nascosta del tutto: resta solo un pulsante per riaprirla. */
  hidden: boolean;
  side: SidebarSide;
}

const clamp = (width: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)));

function load(): SidebarPrefs {
  const fallback: SidebarPrefs = { width: SIDEBAR_DEFAULT, collapsed: false, hidden: false, side: "left" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<SidebarPrefs>;
    return {
      width: typeof p.width === "number" ? clamp(p.width) : fallback.width,
      collapsed: p.collapsed === true,
      hidden: p.hidden === true,
      side: p.side === "right" ? "right" : "left",
    };
  } catch {
    return fallback;
  }
}

interface SidebarContextValue extends SidebarPrefs {
  setWidth: (width: number) => void;
  resetWidth: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setHidden: (hidden: boolean) => void;
  setSide: (side: SidebarSide) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

/** Preferenze della barra laterale (larghezza, compressa, lato), salvate su questo computer. */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<SidebarPrefs>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // vale solo per questa sessione
    }
  }, [prefs]);

  const setWidth = useCallback((width: number) => setPrefs((p) => ({ ...p, width: clamp(width) })), []);
  const resetWidth = useCallback(() => setPrefs((p) => ({ ...p, width: SIDEBAR_DEFAULT })), []);
  const setCollapsed = useCallback((collapsed: boolean) => setPrefs((p) => ({ ...p, collapsed })), []);
  const setHidden = useCallback((hidden: boolean) => setPrefs((p) => ({ ...p, hidden })), []);
  const setSide = useCallback((side: SidebarSide) => setPrefs((p) => ({ ...p, side })), []);

  const value = useMemo<SidebarContextValue>(
    () => ({ ...prefs, setWidth, resetWidth, setCollapsed, setHidden, setSide }),
    [prefs, setWidth, resetWidth, setCollapsed, setHidden, setSide],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import presetsJson from "./presets.json";
import { applyRadius, applyTheme } from "./apply-theme";
import { buildTheme, isHex, isThemeDefinition } from "./build-theme";
import type { ResolvedTheme, ThemeDefinition, ThemePreference } from "./types";

export const PRESETS = presetsJson as unknown as ThemeDefinition[];
const DEFAULT_DARK_ID = "graphite";
const DEFAULT_LIGHT_ID = "daylight";
const STORAGE_KEY = "chat:theme";

/** `system`: segue il tema chiaro/scuro del sistema operativo. */
export type ThemeMode = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: ResolvedTheme;
  definition: ThemeDefinition;
  themes: ThemeDefinition[]; // preset + importati
  preference: ThemePreference;
  /** Modalità scelta dall'utente (con `system` il tema effettivo dipende dal sistema). */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Seleziona un tema; ricorda anche quale usare per il suo modo (chiaro/scuro) quando si segue il sistema. */
  setTheme: (id: string) => void;
  setCustomAccent: (hex: string | null) => void;
  /** Stondatura degli angoli (0 = squadrato, 1 = normale, 1.5 = molto arrotondato). */
  setRadius: (scale: number) => void;
  /** JSON del tema in uso (con l'accento personalizzato, se c'è), pronto da salvare/condividere. */
  exportTheme: () => string;
  /** Aggiunge un tema da JSON e lo seleziona. Restituisce "invalid_json" | "invalid_format", o null se ok. */
  importTheme: (json: string) => string | null;
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const defaultPreference = (): ThemePreference => ({
  themeId: DEFAULT_DARK_ID,
  customAccent: null,
  customThemes: [],
  followSystem: false,
  darkThemeId: DEFAULT_DARK_ID,
  lightThemeId: DEFAULT_LIGHT_ID,
  radius: 1,
});

function load(): ThemePreference {
  const fallback = defaultPreference();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<ThemePreference>;
    return {
      themeId: typeof p.themeId === "string" ? p.themeId : fallback.themeId,
      customAccent: isHex(p.customAccent) ? p.customAccent : null,
      customThemes: Array.isArray(p.customThemes) ? p.customThemes.filter(isThemeDefinition) : [],
      followSystem: p.followSystem === true,
      darkThemeId: typeof p.darkThemeId === "string" ? p.darkThemeId : fallback.darkThemeId,
      lightThemeId: typeof p.lightThemeId === "string" ? p.lightThemeId : fallback.lightThemeId,
      radius: typeof p.radius === "number" ? Math.min(1.5, Math.max(0, p.radius)) : fallback.radius,
    };
  } catch {
    return fallback;
  }
}

/** Il sistema operativo è in modalità scura? Si aggiorna se l'utente lo cambia mentre l'app è aperta. */
function useSystemDark(): boolean {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia?.(query).matches ?? true);

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return dark;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(load);
  const systemDark = useSystemDark();

  const themes = useMemo(() => [...PRESETS, ...preference.customThemes], [preference.customThemes]);

  const activeId = preference.followSystem
    ? systemDark
      ? preference.darkThemeId
      : preference.lightThemeId
    : preference.themeId;

  const definition = useMemo(() => {
    const wantsLight = preference.followSystem && !systemDark;
    const fallbackId = wantsLight ? DEFAULT_LIGHT_ID : DEFAULT_DARK_ID;
    return themes.find((t) => t.id === activeId) ?? themes.find((t) => t.id === fallbackId) ?? PRESETS[0];
  }, [themes, activeId, preference.followSystem, systemDark]);

  const theme = useMemo(() => buildTheme(definition, preference.customAccent), [definition, preference.customAccent]);

  useEffect(() => {
    applyRadius(preference.radius);
  }, [preference.radius]);

  useEffect(() => {
    applyTheme(theme, definition.mode);
  }, [theme, definition.mode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
    } catch {
      // storage non disponibile: il tema vale solo per questa sessione
    }
  }, [preference]);

  const mode: ThemeMode = preference.followSystem ? "system" : definition.mode;

  const setTheme = useCallback((id: string) => {
    setPreference((p) => {
      const def = [...PRESETS, ...p.customThemes].find((t) => t.id === id);
      if (!def) return p;
      const slot = def.mode === "dark" ? { darkThemeId: id } : { lightThemeId: id };
      return { ...p, ...slot, themeId: id, customAccent: null };
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setPreference((p) => {
      const all = [...PRESETS, ...p.customThemes];
      if (next === "system") {
        // Il tema attuale diventa quello del suo modo; per l'altro si usa l'ultimo scelto.
        const current = all.find((t) => t.id === p.themeId);
        return {
          ...p,
          followSystem: true,
          darkThemeId: current?.mode === "dark" ? current.id : p.darkThemeId,
          lightThemeId: current?.mode === "light" ? current.id : p.lightThemeId,
        };
      }
      const remembered = next === "dark" ? p.darkThemeId : p.lightThemeId;
      const fallback = next === "dark" ? DEFAULT_DARK_ID : DEFAULT_LIGHT_ID;
      const id = all.some((t) => t.id === remembered && t.mode === next) ? remembered : fallback;
      return { ...p, followSystem: false, themeId: id };
    });
  }, []);

  const setRadius = useCallback((scale: number) => setPreference((p) => ({ ...p, radius: Math.min(1.5, Math.max(0, scale)) })), []);
  const setCustomAccent = useCallback((hex: string | null) => setPreference((p) => ({ ...p, customAccent: hex })), []);
  const reset = useCallback(() => setPreference(defaultPreference()), []);

  const exportTheme = useCallback(() => {
    const colors = { ...definition.colors, ...(preference.customAccent ? { accent: theme.accent, accentFg: theme.accentFg } : {}) };
    const out: ThemeDefinition = preference.customAccent
      ? { ...definition, id: "custom", name: "Custom", colors }
      : definition;
    return JSON.stringify(out, null, 2);
  }, [definition, preference.customAccent, theme.accent, theme.accentFg]);

  const importTheme = useCallback((json: string): string | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return "invalid_json";
    }
    if (!isThemeDefinition(parsed)) return "invalid_format";
    const incoming = parsed;
    setPreference((p) => {
      const slot = incoming.mode === "dark" ? { darkThemeId: incoming.id } : { lightThemeId: incoming.id };
      return {
        ...p,
        ...slot,
        themeId: incoming.id,
        customAccent: null,
        followSystem: false,
        customThemes: [...p.customThemes.filter((t) => t.id !== incoming.id), incoming],
      };
    });
    return null;
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      definition,
      themes,
      preference,
      mode,
      setMode,
      setTheme,
      setCustomAccent,
      setRadius,
      exportTheme,
      importTheme,
      reset,
    }),
    [theme, definition, themes, preference, mode, setMode, setTheme, setCustomAccent, setRadius, exportTheme, importTheme, reset],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme va usato dentro <ThemeProvider>");
  return ctx;
}

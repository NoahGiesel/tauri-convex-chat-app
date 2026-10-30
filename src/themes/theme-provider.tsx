import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import presetsJson from "./presets.json";
import { applyTheme } from "./apply-theme";
import { buildTheme, isHex, isThemeDefinition } from "./build-theme";
import type { ResolvedTheme, ThemeDefinition, ThemePreference } from "./types";

export const PRESETS = presetsJson as unknown as ThemeDefinition[];
const DEFAULT_ID = "graphite";
const STORAGE_KEY = "chat:theme";

interface ThemeContextValue {
  theme: ResolvedTheme;
  definition: ThemeDefinition;
  themes: ThemeDefinition[]; // preset + importati
  preference: ThemePreference;
  setTheme: (id: string) => void;
  setCustomAccent: (hex: string | null) => void;
  /** JSON del tema in uso (con l'accento personalizzato, se c'è), pronto da salvare/condividere. */
  exportTheme: () => string;
  /** Aggiunge un tema da JSON e lo seleziona. Restituisce "invalid_json" | "invalid_format", o null se ok. */
  importTheme: (json: string) => string | null;
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const defaultPreference = (): ThemePreference => ({ themeId: DEFAULT_ID, customAccent: null, customThemes: [] });

function load(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPreference();
    const p = JSON.parse(raw) as Partial<ThemePreference>;
    return {
      themeId: typeof p.themeId === "string" ? p.themeId : DEFAULT_ID,
      customAccent: isHex(p.customAccent) ? p.customAccent : null,
      customThemes: Array.isArray(p.customThemes) ? p.customThemes.filter(isThemeDefinition) : [],
    };
  } catch {
    return defaultPreference();
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(load);

  const themes = useMemo(() => [...PRESETS, ...preference.customThemes], [preference.customThemes]);
  const definition = useMemo(
    () => themes.find((t) => t.id === preference.themeId) ?? PRESETS.find((t) => t.id === DEFAULT_ID) ?? PRESETS[0],
    [themes, preference.themeId],
  );
  const theme = useMemo(() => buildTheme(definition, preference.customAccent), [definition, preference.customAccent]);

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

  const setTheme = useCallback((id: string) => setPreference((p) => ({ ...p, themeId: id, customAccent: null })), []);
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
    setPreference((p) => ({
      themeId: incoming.id,
      customAccent: null,
      customThemes: [...p.customThemes.filter((t) => t.id !== incoming.id), incoming],
    }));
    return null;
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, definition, themes, preference, setTheme, setCustomAccent, exportTheme, importTheme, reset }),
    [theme, definition, themes, preference, setTheme, setCustomAccent, exportTheme, importTheme, reset],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme va usato dentro <ThemeProvider>");
  return ctx;
}

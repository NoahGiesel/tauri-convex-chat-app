import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { de } from "./de";
import { en, type MessageKey, type Messages } from "./en";
import { es } from "./es";
import { it } from "./it";
import { ro } from "./ro";

/** Lingue supportate. `label` è sempre scritto nella lingua stessa. L'inglese è il default. */
export const LANGUAGES = [
  { code: "en", label: "English", locale: "en-US" },
  { code: "de", label: "Deutsch", locale: "de-DE" },
  { code: "it", label: "Italiano", locale: "it-IT" },
  { code: "ro", label: "Română", locale: "ro-RO" },
  { code: "es", label: "Español", locale: "es-ES" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

const DEFAULT_LANGUAGE: Language = "en";
const STORAGE_KEY = "chat:lang";

const DICTIONARIES: Record<Language, Messages> = { en, de, it, ro, es };

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((l) => l.code === value);
}

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // localStorage può non essere disponibile: si resta sull'inglese.
  }
  return DEFAULT_LANGUAGE;
}

type Params = Record<string, string | number>;

interface I18nContextValue {
  language: Language;
  /** Locale BCP 47 per formattare date e numeri (es. "it-IT"). */
  locale: string;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, params?: Params) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non è grave: la scelta vale per questa sessione.
    }
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: Params) => {
      const template = DICTIONARIES[language][key] ?? en[key];
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
      );
    },
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: LANGUAGES.find((l) => l.code === language)?.locale ?? "en-US",
      setLanguage,
      t,
    }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

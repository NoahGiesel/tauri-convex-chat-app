/** Colori "di base" di un tema. Tutto il resto (varianti soft, bordi accentati…) viene derivato. */
export interface ThemeColors {
  // Superfici, dalla più scura alla più chiara
  bg: string; // sfondo della finestra
  sidebar: string; // barra laterale
  panel: string; // area principale
  field: string; // input e campi
  raised: string; // popup, hover
  border: string;
  borderStrong: string;
  // Testo
  text: string;
  textStrong: string; // titoli
  textSoft: string;
  textMuted: string;
  textDim: string;
  // Accento
  accent: string;
  accentFg: string; // testo sopra l'accento
  // Stati
  online: string;
  offline: string;
  ai: string; // "sta generando con l'AI"
  upload: string; // "sta caricando"
  // Decorazioni
  avatars: string[]; // almeno 3, scelti in base all'utente
  art: string[]; // 6 colori del pannello illustrato del login
}

export interface ThemeDefinition {
  version: 1;
  id: string;
  name: string;
  description?: string;
  mode: "dark" | "light";
  colors: ThemeColors;
}

/** Tema pronto all'uso: colori di base + derivati, tutti stringhe esadecimali. */
export type ResolvedTheme = Omit<ThemeColors, "avatars" | "art"> & {
  accentBright: string;
  accentText: string;
  accentSoft: string;
  accentSoftBorder: string;
  accentSoftStrong: string;
  aiText: string;
  aiBg: string;
  aiBorder: string;
  uploadBg: string;
  onlineBg: string;
  backdrop: string;
  avatars: string[];
  art: string[];
};

/** Preferenza salvata per utente (in seguito sincronizzabile con Convex). */
export interface ThemePreference {
  themeId: string;
  /** Se presente, sostituisce l'accento del tema scelto. */
  customAccent: string | null;
  /** Temi importati dall'utente. */
  customThemes: ThemeDefinition[];
  /** Se vero, il tema segue il sistema: `darkThemeId` col buio, `lightThemeId` col chiaro. */
  followSystem: boolean;
  darkThemeId: string;
  lightThemeId: string;
  /** Moltiplicatore della stondatura degli angoli: 0 (squadrato) … 1.5; 1 è il valore normale. */
  radius: number;
}

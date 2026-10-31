import type { ResolvedTheme, ThemeColors, ThemeDefinition } from "./types";

const HEX = /^#[0-9a-fA-F]{6}$/;

export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

const rgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Mescola `a` con `b`: `p` è la quota di `a` (0..1). */
export function mix(a: string, b: string, p: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return (
    "#" +
    A.map((v, i) =>
      Math.round(v * p + B[i] * (1 - p))
        .toString(16)
        .padStart(2, "0"),
    ).join("")
  );
}

export function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Colore del testo leggibile sopra `bg`: scuro o bianco, quello con più contrasto. */
export function readableOn(bg: string): string {
  return contrast("#10131a", bg) >= contrast("#ffffff", bg) ? "#10131a" : "#ffffff";
}

/** Calcola i colori derivati. Con `accentOverride` cambia accento e relativo testo. */
export function buildTheme(def: ThemeDefinition, accentOverride?: string | null): ResolvedTheme {
  const c: ThemeColors = { ...def.colors };
  if (accentOverride && isHex(accentOverride)) {
    c.accent = accentOverride;
    c.accentFg = readableOn(accentOverride);
  }
  // Nei temi chiari testo e bordi "luminosi" diventano scuri, altrimenti sparirebbero sul bianco.
  const light = def.mode === "light";
  return {
    ...c,
    accentBright: light ? mix(c.accent, "#000000", 0.85) : mix(c.accent, "#ffffff", 0.78),
    accentText: light ? mix(c.accent, "#000000", 0.7) : mix(c.accent, "#ffffff", 0.55),
    accentSoft: mix(c.accent, c.panel, 0.18),
    accentSoftBorder: mix(c.accent, c.panel, 0.38),
    accentSoftStrong: mix(c.accent, c.panel, 0.32),
    aiText: light ? mix(c.ai, "#000000", 0.65) : mix(c.ai, "#ffffff", 0.6),
    aiBg: mix(c.ai, c.panel, 0.15),
    aiBorder: mix(c.ai, c.panel, 0.3),
    uploadBg: mix(c.upload, c.panel, 0.16),
    onlineBg: mix(c.online, c.panel, 0.16),
    backdrop: mix(c.bg, "#000000", light ? 0.4 : 0.45),
  };
}

/** Controllo minimo per i JSON importati dall'utente (lo schema completo è theme.schema.json). */
export function isThemeDefinition(v: unknown): v is ThemeDefinition {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Partial<ThemeDefinition>;
  if (t.version !== 1 || typeof t.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(t.id)) return false;
  if (typeof t.name !== "string" || !t.name || (t.mode !== "dark" && t.mode !== "light")) return false;
  const c = t.colors as Partial<Record<keyof ThemeColors, unknown>> | undefined;
  if (!c) return false;
  const single = [
    "bg", "sidebar", "panel", "field", "raised", "border", "borderStrong",
    "text", "textStrong", "textSoft", "textMuted", "textDim",
    "accent", "accentFg", "online", "offline", "ai", "upload",
  ] as const;
  if (!single.every((k) => isHex(c[k]))) return false;
  const av = c.avatars;
  const art = c.art;
  return (
    Array.isArray(av) && av.length >= 3 && av.every(isHex) &&
    Array.isArray(art) && art.length === 6 && art.every(isHex)
  );
}

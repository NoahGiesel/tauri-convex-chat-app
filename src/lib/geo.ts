import type { MessageKey } from "@/i18n/en";
import type { GeoClue, GeoOutcomeReason, GeoResultSummary, GeoZone } from "../../convex/geoRules";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export const ZONE_NAME: Record<GeoZone, MessageKey> = { italy: "geo.zone.italy", europe: "geo.zone.europe", world: "geo.zone.world" };

export const CLUE_NAME: Record<GeoClue, MessageKey> = { name: "geo.clue.name", photo: "geo.clue.photo" };

/** Dove guarda la mappa all'inizio di ogni Round, per Zone: [lng, lat] e zoom. */
export const ZONE_VIEW: Record<GeoZone, { center: [number, number]; zoom: number }> = {
  italy: { center: [12.5, 42], zoom: 4.6 },
  europe: { center: [12, 52], zoom: 2.8 },
  world: { center: [10, 20], zoom: 1 },
};

/** Colori dei segnaposto, gli stessi in ogni tema. */
export const PIN_COLOR = { me: "#2563eb", other: "#f97316", place: "#16a34a" } as const;

const MAP_THEME_KEY = "geo.mapTheme";
export type MapTheme = "light" | "dark";

/** L'aspetto della mappa scelto nella finestra della Run, o null se non è mai stato scelto (allora segue il tema dell'app). */
export function getMapTheme(): MapTheme | null {
  try {
    const v = localStorage.getItem(MAP_THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function setMapTheme(theme: MapTheme): void {
  try {
    localStorage.setItem(MAP_THEME_KEY, theme);
  } catch {
    // ignora
  }
}

/** Punti con il separatore delle migliaia della lingua di chi guarda. */
export function formatPoints(n: number, locale: string): string {
  return n.toLocaleString(locale);
}

/** Distanza leggibile: un decimale sotto i 10 km, poi km interi. */
export function formatKm(km: number, locale: string): string {
  return `${km < 10 ? km.toLocaleString(locale, { maximumFractionDigits: 1 }) : Math.round(km).toLocaleString(locale)} km`;
}

/** La riga di chiusura di ogni esito con un vincitore; il pareggio ha la sua. */
const RESULT_LINE: Record<GeoOutcomeReason, MessageKey> = {
  morePoints: "geo.result.morePoints",
  fasterRun: "geo.result.fasterRun",
  forfeit: "geo.result.forfeit",
};

/** La riga che annuncia la chiusura del Duel, in chat e nella notifica. */
export function formatGeoResult(r: GeoResultSummary, t: Translate, locale: string): string {
  if (r.status === "expired" || r.reason === null) return t("geo.duelExpired");
  const n = formatPoints(r.winnerPoints ?? 0, locale);
  if (r.winnerName === null) return t("geo.result.tie", { n });
  return t(RESULT_LINE[r.reason], { name: r.winnerName, n, m: formatPoints(r.otherPoints ?? 0, locale) });
}

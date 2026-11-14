/**
 * Regole del Geo Duel senza l'elenco delle città: il client può importare questo modulo.
 * Niente import: lo script che genera l'elenco lo carica con Node (`scripts/geo-places/build.mjs`).
 */
export type GeoZone = "italy" | "europe" | "world";
export type GeoRounds = 3 | 5;
/** Cosa vede il giocatore in ogni Round: il nome del posto o una sua foto. */
export type GeoClue = "name" | "photo";
/** Le lingue in cui l'elenco ha i nomi dei posti: le stesse dell'app. */
export type PlaceLanguage = "it" | "en" | "de" | "es" | "ro";
export type PlaceNames = Record<PlaceLanguage, string>;

export const GEO_ZONES: readonly GeoZone[] = ["italy", "europe", "world"];
export const GEO_ROUNDS: readonly GeoRounds[] = [3, 5];
export const GEO_CLUES: readonly GeoClue[] = ["name", "photo"];
export const PLACE_LANGUAGES: readonly PlaceLanguage[] = ["it", "en", "de", "es", "ro"];

/** Bit di ogni Zone nel campo `zones` dell'elenco generato. */
export const ZONE_BIT: Record<GeoZone, number> = { italy: 1, europe: 2, world: 4 };
/** Quanto in fretta calano i punti con la distanza: a questa distanza un Round vale circa il 37% del massimo. */
export const ZONE_SCALE_KM: Record<GeoZone, number> = { italy: 150, europe: 500, world: 2000 };

/** Un invito senza risposta scade dopo 24 ore. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
/** Il Duel si chiude 24 ore dopo l'accettazione (Duel deadline). */
export const DUEL_DEADLINE_MS = 24 * 60 * 60 * 1000;
/** Tolleranza per i tentativi che arrivano proprio sul filo, come nel Wordle Duel. */
export const GRACE_MS = 500;
/** Round timer: 60 secondi che non si fermano mai. */
export const ROUND_MS = 60_000;
export const MAX_POINTS = 5000;

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Distanza ortodromica in km (formula dell'haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Punti di un Round: 5000 a distanza zero, poi calano in modo esponenziale con la scala della Zone. */
export function pointsFor(km: number, zone: GeoZone): number {
  return Math.round(MAX_POINTS * Math.exp(-km / ZONE_SCALE_KM[zone]));
}

/** true se il punto è una coordinata valida. */
export function isLatLng(p: LatLng): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

/** Il nome del posto nella lingua di chi guarda; l'elenco ha sempre tutte le lingue. */
export function placeName(names: PlaceNames, language: string): string {
  return (PLACE_LANGUAGES as readonly string[]).includes(language) ? names[language as PlaceLanguage] : names.en;
}

/** Perché un Duel chiuso è finito così (vedi le regole del vincitore). */
export type GeoOutcomeReason = "morePoints" | "fasterRun" | "forfeit";

/** Il risultato in breve, da cui l'app scrive la riga di chiusura nella lingua di chi legge. */
export interface GeoResultSummary {
  status: "closed" | "expired";
  /** Null per un pareggio o un Duel scaduto. */
  winnerName: string | null;
  /** Null per un Duel scaduto. */
  reason: GeoOutcomeReason | null;
  winnerPoints: number | null;
  otherPoints: number | null;
}

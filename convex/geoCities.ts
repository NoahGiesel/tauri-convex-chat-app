/**
 * Scelta e lettura dei posti del Geo Duel. Solo per il server: il client non importa né questo modulo
 * né `geoPlaces`, così l'app non contiene i posti possibili.
 */
import { PLACE_LANGUAGES, ZONE_BIT, type GeoZone, type LatLng, type PlaceNames } from "./geoRules";
import { PHOTOS, type PhotoRow } from "./geoPhotos";
import { PLACES, type PlaceRow } from "./geoPlaces";

export interface Place extends LatLng {
  id: number;
  country: string;
  names: PlaceNames;
}

export interface Photo {
  /** Il file su Wikimedia Commons: il client non lo vede mai finché il Round è in corso, perché spesso dice il posto. */
  file: string;
  author: string;
  license: string;
  licenseUrl: string;
}

/** Gli elenchi si indicizzano al primo uso. */
let byId: Map<number, PlaceRow> | null = null;
let photoById: Map<number, PhotoRow> | null = null;

/** La foto del posto, o null se non ne ha una. */
export function photoOf(id: number): Photo | null {
  photoById ??= new Map(PHOTOS.map((row) => [row[0], row]));
  const row = photoById.get(id);
  return row ? { file: row[1], author: row[2], license: row[3], licenseUrl: row[4] } : null;
}

function toPlace(row: PlaceRow): Place {
  const [id, lat, lng, country] = row;
  const names = Object.fromEntries(PLACE_LANGUAGES.map((l, i) => [l, row[5 + i] as string])) as PlaceNames;
  return { id, lat, lng, country, names };
}

/** Il posto con questo id GeoNames. Gli id salvati nei Duel vengono dall'elenco, quindi c'è sempre. */
export function placeById(id: number): Place {
  byId ??= new Map(PLACES.map((row) => [row[0], row]));
  const row = byId.get(id);
  if (!row) throw new Error(`geo place ${id} not in the list`);
  return toPlace(row);
}

/** Gli id dei posti di una Zone; con `withPhoto` solo quelli che hanno una foto. */
export function zonePlaceIds(zone: GeoZone, withPhoto = false): number[] {
  return PLACES.filter((row) => row[4] & ZONE_BIT[zone] && (!withPhoto || photoOf(row[0]) !== null)).map((row) => row[0]);
}

/**
 * Pesca a caso `n` posti diversi della Zone, lasciando fuori quelli in `used` (i Duel già fatti nella chat);
 * se non ne restano abbastanza, pesca da tutta la Zone. Va chiamata dentro l'handler, mai al caricamento del modulo.
 */
export function pickPlaces(zone: GeoZone, n: number, used: ReadonlySet<number>, withPhoto = false): number[] {
  const all = zonePlaceIds(zone, withPhoto);
  const fresh = all.filter((id) => !used.has(id));
  const pool = fresh.length >= n ? fresh : all;
  const picked: number[] = [];
  const left = [...pool];
  while (picked.length < n && left.length > 0) {
    const i = Math.floor(Math.random() * left.length);
    picked.push(left[i]);
    left[i] = left[left.length - 1];
    left.pop();
  }
  return picked;
}

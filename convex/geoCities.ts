/**
 * Scelta e lettura dei posti del Geo Duel. Solo per il server: il client non importa né questo modulo
 * né `geoPlaces`, così l'app non contiene i posti possibili.
 */
import { PLACE_LANGUAGES, ZONE_BIT, type GeoZone, type LatLng, type PlaceNames } from "./geoRules";
import { PLACES, type PlaceRow } from "./geoPlaces";

export interface Place extends LatLng {
  id: number;
  country: string;
  names: PlaceNames;
}

/** L'elenco si indicizza al primo uso. */
let byId: Map<number, PlaceRow> | null = null;

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

/** Gli id dei posti di una Zone. */
export function zonePlaceIds(zone: GeoZone): number[] {
  return PLACES.filter((row) => row[4] & ZONE_BIT[zone]).map((row) => row[0]);
}

/**
 * Pesca a caso `n` posti diversi della Zone, lasciando fuori quelli in `used` (i Duel già fatti nella chat);
 * se non ne restano abbastanza, pesca da tutta la Zone. Va chiamata dentro l'handler, mai al caricamento del modulo.
 */
export function pickPlaces(zone: GeoZone, n: number, used: ReadonlySet<number>): number[] {
  const all = zonePlaceIds(zone);
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

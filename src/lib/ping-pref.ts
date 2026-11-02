const KEY = "chat:ping";
const EVENT = "chat:ping-changed";

export type PingPlace = "off" | "status" | "bottomLeft" | "bottomRight" | "avatar" | "composer";
export const PING_PLACES: PingPlace[] = ["status", "bottomLeft", "bottomRight", "avatar", "composer", "off"];

/** Dove mostrare il ping. Di default accanto allo stato; i valori vecchi ("on", "both") ricadono lì. */
export function getPingPlace(): PingPlace {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw === "bottom" ? "bottomLeft" : raw; // vecchio valore
    return PING_PLACES.includes(v as PingPlace) ? (v as PingPlace) : v === "off" ? "off" : "status";
  } catch {
    return "status";
  }
}

export function setPingPlace(place: PingPlace) {
  try {
    localStorage.setItem(KEY, place);
  } catch {
    /* preferenza non salvata */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onPingPlaceChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

const COMPACT_KEY = "chat:ping-compact";

/** Se vero, mostra solo "42 ms" senza la parola "Ping:". */
export function getPingCompact(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === "on";
  } catch {
    return false;
  }
}

export function setPingCompact(on: boolean) {
  try {
    localStorage.setItem(COMPACT_KEY, on ? "on" : "off");
  } catch {
    /* preferenza non salvata */
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Suono delle notifiche, scelto in Impostazioni › Notifiche e salvato su questo computer.
 * I file stanno in `public/sounds/<id>.mp3` (vedi `public/sounds/README.md`).
 */
export const NOTIFICATION_SOUNDS = [
  { id: "teams", label: "Teams" },
  { id: "slack", label: "Slack" },
  { id: "steam", label: "Steam" },
  { id: "oneplus", label: "OnePlus" },
] as const;

export type NotificationSoundId = (typeof NOTIFICATION_SOUNDS)[number]["id"];

const STORAGE_KEY = "chat:notification-sound";
const DEFAULT_SOUND: NotificationSoundId = "steam";
const VOLUME_KEY = "chat:notification-volume";
const DEFAULT_VOLUME = 70;

export function getNotificationSound(): NotificationSoundId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return NOTIFICATION_SOUNDS.some((s) => s.id === stored) ? (stored as NotificationSoundId) : DEFAULT_SOUND;
  } catch {
    return DEFAULT_SOUND;
  }
}

export function setNotificationSound(id: NotificationSoundId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // vale solo per questa sessione
  }
}

/** Volume da 0 a 100. */
export function getNotificationVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setNotificationVolume(volume: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(Math.min(100, Math.max(0, Math.round(volume)))));
  } catch {
    // vale solo per questa sessione
  }
}

const ENABLED_KEY = "chat:notification-sound-enabled";

export function isNotificationSoundEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // vale solo per questa sessione
  }
}

let current: HTMLAudioElement | null = null;

/** Riproduce un suono (quello scelto, se non si indica). Gli errori (file mancante, audio bloccato) si ignorano. */
export function playNotificationSound(id: NotificationSoundId = getNotificationSound(), force = false) {
  if (!force && !isNotificationSoundEnabled()) return;
  try {
    current?.pause();
    current = new Audio(`/sounds/${id}.mp3`);
    current.volume = getNotificationVolume() / 100;
    if (current.volume === 0) return;
    void current.play().catch(() => undefined);
  } catch {
    // niente suono
  }
}

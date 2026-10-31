// Regole condivise tra server e client per gli allegati (nessuna dipendenza: si importa da entrambi).

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Valore per l'attributo `accept` del selettore file. */
export const MEDIA_ACCEPT = [...Object.keys(IMAGE_TYPES), ...Object.keys(VIDEO_TYPES)].join(",");

export type MediaCheck =
  | { ok: true; type: "image" | "video"; ext: string }
  | { ok: false; reason: "media_type" | "media_too_large" };

export function classifyMedia(mime: string, size: number): MediaCheck {
  const image = IMAGE_TYPES[mime];
  const video = VIDEO_TYPES[mime];
  if (!image && !video) return { ok: false, reason: "media_type" };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: "media_type" };
  if (size > (image ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) return { ok: false, reason: "media_too_large" };
  return image ? { ok: true, type: "image", ext: image } : { ok: true, type: "video", ext: video };
}

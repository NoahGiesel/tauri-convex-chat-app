import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

/** Larghezza della foto chiesta a Wikimedia Commons: basta per una finestra grande, e la miniatura è già pronta. */
const PHOTO_WIDTH = 1600;
const USER_AGENT = "tauri-convex-chat-geo/1.0 (https://github.com/NoahGiesel/tauri-convex-chat-app)";

/**
 * Toglie da un JPEG i blocchi APP1 (EXIF e XMP), dove possono esserci le coordinate GPS e il nome del posto.
 * Un file che non è un JPEG torna com'è.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const out: number[] = [0xff, 0xd8];
  let pos = 2;
  while (pos + 4 <= bytes.length && bytes[pos] === 0xff) {
    const marker = bytes[pos + 1];
    // Da SOS in poi ci sono i dati dell'immagine: si copiano tutti.
    if (marker === 0xda) break;
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const end = pos + 2 + length;
    if (marker !== 0xe1) for (let i = pos; i < end && i < bytes.length; i++) out.push(bytes[i]);
    pos = end;
  }
  const result = new Uint8Array(out.length + Math.max(0, bytes.length - pos));
  result.set(out);
  result.set(bytes.subarray(pos), out.length);
  return result;
}

/**
 * `GET /geo/photo?d=<Duel>&i=<Round>&k=<chiave>`: la foto del posto di un Round, scaricata da Wikimedia Commons e
 * ripulita dai metadati. L'indirizzo non dice mai quale sia il file, che spesso ha il nome del posto.
 */
export const servePhoto = httpAction(async (ctx, req) => {
  const params = new URL(req.url).searchParams;
  const index = Number(params.get("i"));
  const file = await ctx.runQuery(internal.geoDuels.photoFile, {
    duelId: params.get("d") ?? "",
    index: Number.isInteger(index) ? index : -1,
    key: params.get("k") ?? "",
  });
  if (!file) return new Response("Not found", { status: 404 });

  const res = await fetch(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${PHOTO_WIDTH}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) return new Response("Photo unavailable", { status: 502 });
  const type = res.headers.get("Content-Type") ?? "image/jpeg";
  const bytes = stripJpegMetadata(new Uint8Array(await res.arrayBuffer()));
  return new Response(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "Access-Control-Allow-Origin": "*" },
  });
});

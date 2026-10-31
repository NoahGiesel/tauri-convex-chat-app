import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { requireProfile } from "./model";

const MAX_URL = 2000;
const MAX_HTML_BYTES = 300_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6000;
const RETRY_FAILED_MS = 60 * 60 * 1000;
const UA = "Mozilla/5.0 (compatible; FriendsChatLinkPreview/1.0)";

export interface Preview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

/** Solo http(s) verso siti pubblici: niente localhost, reti interne o indirizzi IP numerici. */
function isPublicHttpUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || !host.includes(".")) return null;
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Legge i meta tag Open Graph (con ripiego su Twitter card e <title>). */
export function parseHtml(html: string, base: URL): Preview {
  const meta = new Map<string, string>();
  for (const tag of html.matchAll(/<meta\s[^>]*>/gi)) {
    const attrs = new Map<string, string>();
    for (const a of tag[0].matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? "");
    }
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase();
    const content = attrs.get("content");
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find((x) => x && x.trim());

  const title = decode(pick("og:title", "twitter:title") ?? titleTag ?? "").slice(0, 200);
  const description = decode(pick("og:description", "twitter:description", "description") ?? "").slice(0, 300);
  const siteName = decode(pick("og:site_name") ?? "").slice(0, 80);

  let image: string | undefined;
  const rawImage = pick("og:image:secure_url", "og:image", "twitter:image");
  if (rawImage) {
    try {
      const u = new URL(decode(rawImage), base);
      if (u.protocol === "https:") image = u.toString().slice(0, 1000);
    } catch {
      // immagine non valida: si ignora
    }
  }
  return { title: title || undefined, description: description || undefined, siteName: siteName || undefined, image };
}

/** Scarica al massimo MAX_HTML_BYTES di una pagina HTML, seguendo i redirect a mano (e ricontrollandoli). */
async function fetchHtml(start: URL): Promise<{ html: string; url: URL } | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en,it;q=0.8", Cookie: "CONSENT=YES+1" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      const next = location ? isPublicHttpUrl(new URL(location, url).toString()) : null;
      if (!next) return null;
      url = next;
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/html") || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return { html: new TextDecoder("utf-8", { fatal: false }).decode(bytes), url };
  }
  return null;
}

const isYouTube = (host: string) => ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host);

/** YouTube a volte mostra una pagina di consenso ai server europei: l'oEmbed ufficiale è più affidabile. */
async function youtubePreview(url: URL): Promise<Preview | null> {
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": UA },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  if (!data.title) return null;
  return {
    title: data.title.slice(0, 200),
    description: data.author_name?.slice(0, 300),
    image: data.thumbnail_url?.startsWith("https://") ? data.thumbnail_url : undefined,
    siteName: "YouTube",
  };
}

/** L'anteprima salvata per un indirizzo (null se non è ancora stata richiesta). */
export const get = query({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    await requireProfile(ctx);
    if (args.url.length > MAX_URL) return null;
    const doc = await ctx.db.query("linkPreviews").withIndex("by_url", (q) => q.eq("url", args.url)).unique();
    if (!doc) return null;
    return {
      ok: doc.ok,
      title: doc.title ?? null,
      description: doc.description ?? null,
      image: doc.image ?? null,
      siteName: doc.siteName ?? null,
      fetchedAt: doc.fetchedAt,
    };
  },
});

export const existing = internalQuery({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    await requireProfile(ctx);
    const doc = await ctx.db.query("linkPreviews").withIndex("by_url", (q) => q.eq("url", args.url)).unique();
    return doc ? { ok: doc.ok, fetchedAt: doc.fetchedAt } : null;
  },
});

export const save = internalMutation({
  args: {
    url: v.string(),
    ok: v.boolean(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    image: v.optional(v.string()),
    siteName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const doc = await ctx.db.query("linkPreviews").withIndex("by_url", (q) => q.eq("url", args.url)).unique();
    const value = { ...args, fetchedAt: Date.now() };
    if (doc) await ctx.db.replace("linkPreviews", doc._id, value);
    else await ctx.db.insert("linkPreviews", value);
    return null;
  },
});

/** Scarica la pagina e salva titolo, descrizione e immagine. Se esiste già non rifà la richiesta. */
export const fetchPreview = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<null> => {
    if (args.url.length > MAX_URL) return null;
    const url = isPublicHttpUrl(args.url);
    if (!url) return null;
    const prev = await ctx.runQuery(internal.previews.existing, { url: args.url });
    if (prev && (prev.ok || Date.now() - prev.fetchedAt < RETRY_FAILED_MS)) return null;

    let preview: Preview | null = null;
    try {
      if (isYouTube(url.hostname.toLowerCase())) preview = await youtubePreview(url).catch(() => null);
      if (!preview) {
        const page = await fetchHtml(url);
        if (page) preview = parseHtml(page.html, page.url);
      }
    } catch {
      preview = null;
    }
    const ok = !!preview && !!(preview.title || preview.image);
    await ctx.runMutation(internal.previews.save, { url: args.url, ok, ...(ok ? preview : {}) });
    return null;
  },
});

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { extractLinks } from "./linkRules";
import { fail, getProfile, requireMember } from "./model";
import { blocksNewSummary } from "./summaryRules";
import { fetchHtml, isPublicHttpUrl } from "./previews";
import { aiModel, summaryPrompt } from "./summaryPrompt";

const LONG_TEXT = 10_000;
const MAX_SOURCE_CHARS = 150_000; // oltre questo il testo viene tagliato prima di mandarlo al modello
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const VIDEO_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 2500;
const MAX_VIDEO_SECONDS = 60 * 60; // oltre un'ora non si trascrive
const VIDEO_EXT = /\.(mp4|webm|mov|mpeg|mpg)(?:$|[?#])/i;
const VIDEO_MIME: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/mov", mpeg: "video/mpeg", mpg: "video/mpeg" };

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"];

// ---------- accesso al messaggio ----------

/** Controlla che chi chiede sia nella chat, che il messaggio si possa riassumere e che non lo sia già stato. */
export const load = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) throw fail("not_authenticated");
    const message = await ctx.db.get("messages", args.messageId);
    if (!message) throw fail("message_not_found");
    await requireMember(ctx, message.conversationId, me._id);
    if (message.kind !== "text") throw fail("nothing_to_summarize");
    const existing = await ctx.db.query("messages").withIndex("by_summaryOf", (q) => q.eq("summaryOf", message._id)).order("desc").first();
    if (blocksNewSummary(existing, Date.now())) throw fail("already_summarized");
    return { profileId: me._id, conversationId: message.conversationId, body: message.body };
  },
});

/** Pubblica subito un messaggio "in corso" (lo vedono tutti), da riempire poi con `finish`. */
export const begin = internalMutation({
  args: { conversationId: v.id("conversations"), requestedBy: v.id("profiles"), summaryOf: v.id("messages") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("messages").withIndex("by_summaryOf", (q) => q.eq("summaryOf", args.summaryOf)).order("desc").first();
    if (blocksNewSummary(existing, now)) throw fail("already_summarized");
    if (existing) await ctx.db.delete("messages", existing._id); // tentativo fallito precedente
    const id = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      kind: "ai",
      body: "",
      requestedBy: args.requestedBy,
      summaryOf: args.summaryOf,
      summaryStatus: "pending",
    });
    await ctx.db.patch("conversations", args.conversationId, { lastMessageAt: now });
    const members = await ctx.db.query("members").withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId)).take(50);
    for (const m of members) {
      await ctx.db.patch("members", m._id, m.profileId === args.requestedBy ? { lastMessageAt: now, lastReadAt: now } : { lastMessageAt: now });
    }
    return id;
  },
});

export const finish = internalMutation({
  args: { messageId: v.id("messages"), body: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("messages", args.messageId, { body: args.body, summaryStatus: "done" });
    const saved = await ctx.db.query("transcripts").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    if (!saved) await ctx.db.insert("transcripts", { key: args.key, body: args.body });
  },
});

/** La trascrizione già salvata per questo contenuto (e lingua), se esiste. */
export const cached = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const saved = await ctx.db.query("transcripts").withIndex("by_key", (q) => q.eq("key", args.key)).first();
    return saved?.body ?? null;
  },
});

/** Se qualcosa va storto il messaggio "in corso" sparisce. */
export const abort = internalMutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    if (await ctx.db.get("messages", args.messageId)) await ctx.db.delete("messages", args.messageId);
  },
});

// ---------- lettura delle fonti ----------

/** Testo leggibile di una pagina: toglie script, menu e simili e tiene i paragrafi. */
function htmlToText(html: string): string {
  let h = html.replace(/<(script|style|noscript|svg|template|iframe|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ");
  const inner = (tag: string) => new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, "i").exec(h)?.[0];
  h = inner("article") ?? inner("main") ?? h;
  h = h.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  h = h
    .replace(/&#x([0-9a-f]+);/gi, (_, x: string) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n: string) => entities[n.toLowerCase()] ?? m);
  return h
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Scarica un video pubblico (con un tetto di peso) e lo restituisce come data URL. */
async function downloadVideo(url: URL, ext: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(VIDEO_TIMEOUT_MS), redirect: "follow" });
  if (!res.ok || !res.body) throw fail("source_unreachable");
  if (Number(res.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES) throw fail("source_unreachable");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_VIDEO_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw fail("source_unreachable");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return `data:${VIDEO_MIME[ext.toLowerCase()] ?? "video/mp4"};base64,${toBase64(bytes)}`;
}

/** Durata di un video YouTube in secondi, letta dalla pagina; null se non si riesce a saperla. */
async function youtubeDurationSeconds(url: URL): Promise<number | null> {
  const page = await fetchHtml(url).catch(() => null);
  if (!page) return null;
  const iso = /<meta[^>]+itemprop=["']duration["'][^>]+content=["']PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?["']/i.exec(page.html);
  if (iso) return Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0);
  const plain = /"lengthSeconds":"(\d+)"/.exec(page.html);
  return plain ? Number(plain[1]) : null;
}

type Part = { type: "text"; text: string } | { type: "video_url"; video_url: { url: string } };

/** Cosa mandare al modello per un messaggio: testo lungo, video (YouTube o file) o articolo di una pagina. */
async function buildInput(body: string): Promise<{ parts: Part[]; youtube: boolean }> {
  if (body.length >= LONG_TEXT) {
    return { parts: [{ type: "text", text: `Summarize the following text.\n\n${body.slice(0, MAX_SOURCE_CHARS)}` }], youtube: false };
  }
  const link = extractLinks(body)[0];
  if (!link) throw fail("nothing_to_summarize");
  const url = isPublicHttpUrl(link);
  if (!url) throw fail("source_unreachable");

  if (YOUTUBE_HOSTS.includes(url.hostname.toLowerCase())) {
    // Se la durata non si legge si procede comunque: YouTube a volte non risponde ai server.
    const seconds = await youtubeDurationSeconds(url);
    if (seconds !== null && seconds > MAX_VIDEO_SECONDS) throw fail("video_too_long");
    return { parts: [{ type: "text", text: "Summarize this video." }, { type: "video_url", video_url: { url: url.toString() } }], youtube: true };
  }
  const ext = VIDEO_EXT.exec(url.pathname + url.search)?.[1];
  if (ext) {
    const dataUrl = await downloadVideo(url, ext);
    return { parts: [{ type: "text", text: "Summarize this video." }, { type: "video_url", video_url: { url: dataUrl } }], youtube: false };
  }
  const page = await fetchHtml(url).catch(() => null);
  if (!page) throw fail("source_unreachable");
  const text = htmlToText(page.html);
  if (text.length < 300) throw fail("source_unreachable"); // pagina vuota, a pagamento o che serve JavaScript
  return { parts: [{ type: "text", text: `Summarize this article (source: ${page.url.hostname}).\n\n${text.slice(0, MAX_SOURCE_CHARS)}` }], youtube: false };
}

// ---------- chiave del contenuto ----------

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|igshid$|si$|feature$|ref$)/i;

/** Forma canonica di ciò che si trascrive: lo stesso video o articolo scritto in modi diversi dà la stessa chiave. */
function canonicalSource(body: string): string | null {
  if (body.length >= LONG_TEXT) return `text:${body.trim()}`;
  const link = extractLinks(body)[0];
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (YOUTUBE_HOSTS.includes(url.hostname.toLowerCase())) {
    const id =
      host === "youtu.be"
        ? url.pathname.split("/")[1]
        : (url.searchParams.get("v") ?? /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(url.pathname)?.[1]);
    if (id) return `youtube:${id}`;
  }
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return `url:${host}${url.pathname.replace(/\/+$/, "")}${url.search}`;
}

async function sourceKey(body: string, language: string): Promise<string> {
  const canonical = canonicalSource(body);
  if (!canonical) throw fail("nothing_to_summarize");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${language}|${canonical}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- l'azione ----------

/** Riassume il link o il testo lungo di un messaggio e pubblica il riassunto nella chat. */
export const summarize = action({
  args: { messageId: v.id("messages"), language: v.string() },
  handler: async (ctx, args) => {
    const source = await ctx.runQuery(internal.summary.load, { messageId: args.messageId });
    const key = await sourceKey(source.body, args.language);
    const pendingId = await ctx.runMutation(internal.summary.begin, {
      conversationId: source.conversationId,
      requestedBy: source.profileId,
      summaryOf: args.messageId,
    });

    try {
      // Controllo rigido: un contenuto già trascritto non si ritrascrive, si ripubblica quello salvato (nessuna chiamata al modello).
      const already = await ctx.runQuery(internal.summary.cached, { key });
      if (already !== null) {
        await ctx.runMutation(internal.summary.finish, { messageId: pendingId, body: already, key });
        return;
      }

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw fail("summary_not_configured");
      const { parts, youtube } = await buildInput(source.body);

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Friends Chat" },
        body: JSON.stringify({
          model: aiModel(),
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.3,
          messages: [
            { role: "system", content: summaryPrompt(args.language) },
            { role: "user", content: parts },
          ],
          // Per i link YouTube serve il provider che li legge direttamente (Google AI Studio).
          ...(youtube && aiModel().startsWith("google/") ? { provider: { order: ["google-ai-studio"], allow_fallbacks: false } } : {}),
        }),
        signal: AbortSignal.timeout(120_000),
      }).catch(() => null);

      if (!res || !res.ok) {
        console.error("OpenRouter", res?.status, await res?.text().catch(() => ""));
        throw fail("summary_failed");
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw fail("summary_failed");

      await ctx.runMutation(internal.summary.finish, { messageId: pendingId, body: text.slice(0, 20_000), key });
    } catch (e) {
      await ctx.runMutation(internal.summary.abort, { messageId: pendingId });
      if (e instanceof ConvexError) throw e;
      throw fail("summary_failed");
    }
  },
});

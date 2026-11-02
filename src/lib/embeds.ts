/** Link di YouTube e Spotify che si possono riprodurre dentro la chat (basta l'indirizzo: niente chiavi né richieste al server). */
export type Embed =
  | { provider: "youtube"; id: string; start: number; short: boolean; thumbnail: string; src: string }
  | { provider: "spotify"; kind: string; src: string; height: number };

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);
const YT_ID = /^[\w-]{11}$/;

function seconds(value: string | null): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

export function embedFor(href: string): Embed | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  if (YT_HOSTS.has(host)) {
    let id: string | null = null;
    let short = false;
    if (host.endsWith("youtu.be")) id = url.pathname.split("/")[1] ?? null;
    else if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(shorts|embed|live|v)\/([\w-]{11})/.exec(url.pathname);
      if (m) {
        id = m[2];
        short = m[1] === "shorts";
      }
    }
    if (!id || !YT_ID.test(id)) return null;
    const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
    const params = new URLSearchParams({ autoplay: "1", rel: "0", playsinline: "1" });
    if (start > 0) params.set("start", String(start));
    return {
      provider: "youtube",
      id,
      start,
      short,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      src: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
    };
  }

  if (host === "open.spotify.com") {
    const m = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/.exec(url.pathname);
    if (!m) return null;
    const compact = m[1] === "track" || m[1] === "episode";
    return {
      provider: "spotify",
      kind: m[1],
      src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0`,
      height: compact ? 152 : 352,
    };
  }
  return null;
}

const IFRAME_TAG = /<iframe\b[^>]*>(?:\s*<\/iframe>)?/gi;

/**
 * Codice `<iframe …>` incollato come testo (il "Incorpora" di Spotify o YouTube): si riconosce solo l'indirizzo, che deve essere
 * di un player noto. Il codice HTML non viene mai inserito nella pagina: si ricostruisce un player nostro.
 */
export function htmlEmbed(body: string): { embed: Embed; url: string; rest: string } | null {
  if (!/<iframe\b/i.test(body)) return null;
  const tag = body.match(IFRAME_TAG)?.[0];
  const src = tag && /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
  if (!tag || !src) return null;
  let url: URL;
  try {
    url = new URL(src.replace(/&amp;/g, "&"));
  } catch {
    return null;
  }
  const rest = body.replace(IFRAME_TAG, "").trim();

  if (url.hostname === "open.spotify.com") {
    const m = /^\/embed\/(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/.exec(url.pathname);
    if (!m) return null;
    const height = Number(/\bheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1]);
    return {
      embed: {
        provider: "spotify",
        kind: m[1],
        src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0`,
        height: Number.isFinite(height) && height >= 80 && height <= 800 ? height : m[1] === "track" || m[1] === "episode" ? 152 : 352,
      },
      url: `https://open.spotify.com/${m[1]}/${m[2]}`,
      rest,
    };
  }

  if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com" || url.hostname === "www.youtube-nocookie.com") {
    const m = /^\/embed\/([\w-]{11})/.exec(url.pathname);
    if (!m) return null;
    const watch = `https://www.youtube.com/watch?v=${m[1]}${url.searchParams.get("start") ? `&t=${url.searchParams.get("start")}` : ""}`;
    const embed = embedFor(watch);
    return embed ? { embed, url: watch, rest } : null;
  }
  return null;
}

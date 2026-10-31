const API = "https://api.giphy.com/v1/gifs";
const LIMIT = 24;

/** Chiave pubblica di GIPHY (va nel client: GIPHY richiede che le ricerche partano dall'app). */
export const GIPHY_KEY: string | undefined = import.meta.env.VITE_GIPHY_API_KEY?.trim() || undefined;

export interface GifResult {
  id: string;
  title: string;
  /** Piccola anteprima per la griglia. */
  preview: string;
  /** GIF che viene inviata nella chat. */
  url: string;
  width: number;
  height: number;
}

interface GiphyImage {
  url?: string;
  width?: string;
  height?: string;
}
interface GiphyItem {
  id: string;
  title?: string;
  images?: { fixed_height?: GiphyImage; fixed_width_small?: GiphyImage; fixed_width?: GiphyImage };
}

/** Cerca GIF (o mostra le più di tendenza se il testo è vuoto). */
export async function fetchGifs(query: string, lang: string, signal: AbortSignal): Promise<GifResult[]> {
  if (!GIPHY_KEY) throw new Error("no_key");
  const q = query.trim().slice(0, 50);
  const params = new URLSearchParams({ api_key: GIPHY_KEY, limit: String(LIMIT), rating: "pg-13" });
  if (q) {
    params.set("q", q);
    params.set("lang", lang);
  }
  const response = await fetch(`${API}/${q ? "search" : "trending"}?${params}`, { signal });
  if (!response.ok) throw new Error("request_failed");

  const { data } = (await response.json()) as { data: GiphyItem[] };
  return data.flatMap((item) => {
    const full = item.images?.fixed_height;
    const small = item.images?.fixed_width_small ?? item.images?.fixed_width ?? full;
    if (!full?.url || !small?.url) return [];
    return [
      {
        id: item.id,
        title: item.title ?? "",
        preview: small.url,
        url: full.url,
        width: Number(small.width) || 100,
        height: Number(small.height) || 100,
      },
    ];
  });
}

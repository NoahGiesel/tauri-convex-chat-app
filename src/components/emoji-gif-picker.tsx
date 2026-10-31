import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import type { Theme } from "emoji-picker-react";
import { useI18n } from "@/i18n/i18n-provider";
import { fetchGifs, GIPHY_KEY, type GifResult } from "@/lib/giphy";
import { cn } from "@/lib/utils";
import { useTheme } from "@/themes/theme-provider";

// Il selettore emoji pesa parecchio: si scarica solo alla prima apertura.
const EmojiPicker = lazy(() => import("emoji-picker-react"));

export type PickerTab = "emoji" | "gif";

/** I colori del selettore seguono il tema dell'app. */
export const emojiVars = {
  "--epr-bg-color": "var(--app-panel)",
  "--epr-category-label-bg-color": "var(--app-panel)",
  "--epr-text-color": "var(--app-text)",
  "--epr-picker-border-color": "var(--app-border)",
  "--epr-search-border-color": "var(--app-border)",
  "--epr-search-input-bg-color": "var(--app-field)",
  "--epr-search-input-text-color": "var(--app-text)",
  "--epr-search-input-placeholder-color": "var(--app-text-dim)",
  "--epr-hover-bg-color": "var(--app-field)",
  "--epr-focus-bg-color": "var(--app-field)",
  "--epr-highlight-color": "var(--app-accent)",
  "--epr-category-icon-active-color": "var(--app-accent)",
} as CSSProperties;

/** Il selettore emoji da solo, con i colori del tema. */
export function EmojiPanel({ onEmoji }: { onEmoji: (emoji: string) => void }) {
  const { t } = useI18n();
  const { definition } = useTheme();
  return (
    <div className="h-full" style={emojiVars}>
      <Suspense fallback={<p className="p-4 text-sm text-app-text-muted">{t("common.loading")}</p>}>
        <EmojiPicker
          onEmojiClick={(e) => onEmoji(e.emoji)}
          theme={(definition.mode === "light" ? "light" : "dark") as unknown as Theme}
          width="100%"
          height="100%"
          lazyLoadEmojis
          previewConfig={{ showPreview: false }}
          searchPlaceHolder={t("composer.emojiSearch")}
          style={{ border: "none", borderRadius: 0 }}
        />
      </Suspense>
    </div>
  );
}

export function EmojiGifPicker({
  tab,
  onTab,
  onEmoji,
  onGif,
}: {
  tab: PickerTab;
  onTab: (tab: PickerTab) => void;
  onEmoji: (emoji: string) => void;
  onGif: (url: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex h-[420px] w-[min(360px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-app-border-strong bg-app-panel shadow-2xl">
      <div role="tablist" className="flex gap-1 border-b border-app-border p-1.5">
        {(["emoji", "gif"] as PickerTab[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => onTab(value)}
            className={cn(
              "h-8 flex-1 rounded-lg text-sm font-bold transition-colors",
              tab === value ? "bg-app-accent-soft text-app-text-strong" : "text-app-text-muted hover:text-app-text",
            )}
          >
            {value === "emoji" ? t("composer.emoji") : "GIF"}
          </button>
        ))}
      </div>

      {tab === "emoji" ? (
        <div className="min-h-0 flex-1">
          <EmojiPanel onEmoji={onEmoji} />
        </div>
      ) : (
        <GifTab onGif={onGif} />
      )}
    </div>
  );
}

function GifTab({ onGif }: { onGif: (url: string) => void }) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; gifs: GifResult[] }>({
    status: GIPHY_KEY ? "loading" : "error",
    gifs: [],
  });

  // Ricerca con una breve attesa, così non parte una richiesta a ogni tasto.
  useEffect(() => {
    if (!GIPHY_KEY) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, status: "loading" }));
    const timer = window.setTimeout(
      () => {
        fetchGifs(query, language, controller.signal)
          .then((gifs) => setState({ status: "ready", gifs }))
          .catch((e: unknown) => {
            if (!(e instanceof DOMException && e.name === "AbortError")) setState({ status: "error", gifs: [] });
          });
      },
      query ? 350 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, language]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("composer.gifSearch")}
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full rounded-[10px] border border-app-border bg-app-field px-3 text-sm text-app-text outline-none placeholder:text-app-text-dim focus:border-app-accent-bright"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!GIPHY_KEY ? (
          <p className="p-3 text-sm text-app-text-muted">{t("composer.gifNoKey")}</p>
        ) : state.status === "error" ? (
          <p className="p-3 text-sm text-app-text-muted">{t("composer.gifError")}</p>
        ) : state.status === "ready" && state.gifs.length === 0 ? (
          <p className="p-3 text-sm text-app-text-muted">{t("composer.gifEmpty")}</p>
        ) : (
          <div className={cn("columns-2 gap-1.5", state.status === "loading" && "opacity-60")}>
            {state.gifs.map((g) => (
              <button
                key={g.id}
                type="button"
                title={g.title}
                onClick={() => onGif(g.url)}
                className="mb-1.5 block w-full overflow-hidden rounded-lg bg-app-field hover:ring-2 hover:ring-app-accent"
              >
                <img
                  src={g.preview}
                  alt={g.title}
                  loading="lazy"
                  width={g.width}
                  height={g.height}
                  className="h-auto w-full"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-app-border px-3 py-1.5 text-right text-[11px] font-bold tracking-wide text-app-text-dim uppercase">
        Powered by GIPHY
      </div>
    </div>
  );
}

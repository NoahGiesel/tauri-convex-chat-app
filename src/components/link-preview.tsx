import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Sparkles } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useI18n } from "@/i18n/i18n-provider";
import { embedFor, type Embed } from "@/lib/embeds";
import { openLink } from "@/lib/links";

const RETRY_FAILED_MS = 60 * 60 * 1000;

/** Anteprima Open Graph di un link: titolo, descrizione e immagine, come in Slack. */
/** Azione di riassunto del messaggio, mostrata nel piè della card del player. */
export interface SummaryAction {
  busy: boolean;
  onClick: () => void;
}

export function LinkPreview({ url, onLayout, summary }: { url: string; onLayout?: () => void; summary?: SummaryAction }) {
  const preview = useQuery(api.previews.get, { url });
  const fetchPreview = useAction(api.previews.fetchPreview);
  const requested = useRef(false);

  // Se nessuno l'ha ancora richiesta (o l'ultimo tentativo è fallito da un'ora), la si scarica sul server.
  useEffect(() => {
    if (preview === undefined || requested.current) return;
    if (preview === null || (!preview.ok && Date.now() - preview.fetchedAt > RETRY_FAILED_MS)) {
      requested.current = true;
      void fetchPreview({ url }).catch(() => undefined);
    }
  }, [preview, url, fetchPreview]);

  const visible = !!preview && preview.ok;
  useEffect(() => {
    if (visible) onLayout?.();
  }, [visible, onLayout]);

  const embed = embedFor(url);
  if (embed) return <EmbedPlayer embed={embed} url={url} title={(preview && preview.ok ? preview.title : undefined) ?? undefined} onLayout={onLayout} summary={summary} />;

  if (!preview || !preview.ok) return null;

  return (
    <a
      href={url}
      rel="noreferrer noopener"
      onClick={(e) => {
        e.preventDefault();
        void openLink(url);
      }}
      className="mt-1.5 flex max-w-[min(460px,100%)] items-stretch overflow-hidden rounded-xl border border-app-border border-l-4 border-l-app-accent bg-app-field/50 hover:bg-app-field"
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={onLayout}
          className="m-2 mr-0 size-24 shrink-0 self-center rounded-lg object-cover"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
        {preview.siteName && <div className="truncate text-xs text-app-text-dim">{preview.siteName}</div>}
        {preview.title && <div className="line-clamp-2 text-[15px] leading-snug font-bold text-app-accent-text">{preview.title}</div>}
        {preview.description && <div className="mt-0.5 line-clamp-2 text-sm text-app-text-muted">{preview.description}</div>}
      </div>
    </a>
  );
}

const WIDTH_KEY = "chat:embed-width";
const DEFAULT_WIDTH = 552; // 1,2 volte i 460 px di prima
const MIN_WIDTH = 240;

function readWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(n) && n >= MIN_WIDTH ? n : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

/** Larghezza del player, ridimensionabile trascinando l'angolo in basso a destra (la scelta vale anche per i prossimi player). */
function useEmbedWidth() {
  const [width, setWidth] = useState(readWidth);

  function save(w: number) {
    try {
      localStorage.setItem(WIDTH_KEY, String(Math.round(w)));
    } catch {
      // ignora
    }
  }

  function startDrag(e: React.PointerEvent<HTMLElement>, scale: number, maxWidth: number) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = width;
    let latest = width;
    const move = (ev: PointerEvent) => {
      latest = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX) / scale));
      setWidth(latest);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      save(latest);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  function reset() {
    setWidth(DEFAULT_WIDTH);
    save(DEFAULT_WIDTH);
  }

  return { width, startDrag, reset };
}

/** Spotify si mostra subito; YouTube parte al clic (miniatura prima), così una chat piena di video non ne carica decine insieme. */
export function EmbedPlayer({ embed, url, title, onLayout, summary }: { embed: Embed; url: string; title?: string; onLayout?: () => void; summary?: SummaryAction }) {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(false);
  const { width, startDrag, reset } = useEmbedWidth();
  const host = useRef<HTMLDivElement>(null);
  // Gli Shorts sono verticali: stessa altezza di un video normale, quindi larghezza 9/16.
  const boxWidth = embed.provider === "youtube" && embed.short ? Math.round((width * 9) / 16) : width;

  useEffect(() => {
    onLayout?.();
  }, [playing, boxWidth, onLayout]);

  const grip = (
    <span
      role="separator"
      aria-label={t("embed.resize")}
      title={t("embed.resizeHint")}
      onPointerDown={(e) => {
        // Non oltre lo spazio disponibile nella chat; per gli Shorts la larghezza salvata è quella di un video normale.
        const short = embed.provider === "youtube" && embed.short;
        const available = host.current?.clientWidth ?? 460;
        startDrag(e, short ? 9 / 16 : 1, short ? (available * 16) / 9 : available);
      }}
      onDoubleClick={reset}
      className="absolute right-0 bottom-0 z-10 flex size-6 cursor-nwse-resize touch-none items-end justify-end p-1 opacity-0 transition-opacity group-hover/embed:opacity-100"
    >
      <svg viewBox="0 0 10 10" className="size-3.5 text-white drop-shadow" aria-hidden>
        <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    </span>
  );

  const label = title || (embed.provider === "spotify" ? "Spotify" : "YouTube");
  /** Piè della card: titolo in basso a sinistra (apre il link nel browser), riassunto in basso a destra. */
  const footer = (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={() => void openLink(url)}
        title={t("embed.openOutside")}
        className="min-w-0 flex-1 text-left text-sm leading-snug font-bold text-app-text-strong hover:text-app-accent-text"
      >
        <span className="line-clamp-2">{label}</span>
      </button>
      {summary && (
        <button
          type="button"
          disabled={summary.busy}
          onClick={summary.onClick}
          title={summary.busy ? t("chat.summarizing") : t("chat.summarize")}
          aria-label={summary.busy ? t("chat.summarizing") : t("chat.summarize")}
          className="flex size-8 shrink-0 items-center justify-center rounded-[calc(4px*var(--radius-scale))] border border-app-ai-border bg-app-ai-bg text-app-ai hover:opacity-80 disabled:opacity-60"
        >
          {summary.busy ? <Loader2 className="size-4 animate-spin" strokeWidth={2.2} /> : <Sparkles className="size-4" strokeWidth={2} />}
        </button>
      )}
    </div>
  );
  const cardClass = "flex max-w-full flex-col overflow-hidden rounded-[calc(4px*var(--radius-scale))] border-2 border-app-border-strong bg-app-field/50 shadow-sm";

  if (embed.provider === "spotify") {
    return (
      <div ref={host} className="mt-1.5 w-full min-w-0">
        <div className={cardClass} style={{ width: boxWidth }}>
        <div className="group/embed relative">
          <iframe
            src={embed.src}
            title="Spotify"
            height={embed.height}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen"
            className="block w-full border-0"
          />
          {grip}
        </div>
        {footer}
        </div>
      </div>
    );
  }

  return (
    <div ref={host} className="mt-1.5 w-full min-w-0">
    <div className={cardClass} style={{ width: boxWidth }}>
      <div className="group/embed relative w-full overflow-hidden bg-black" style={{ aspectRatio: embed.short ? "9 / 16" : "16 / 9" }}>
        {playing ? (
          <iframe
            src={embed.src}
            title={title ?? "YouTube"}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)} aria-label={t("embed.play")} className="group absolute inset-0 size-full">
            <img src={embed.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onLoad={onLayout} className="size-full object-cover" />
            <span className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
            <span className="absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 text-white shadow-lg">
              <Play className="ml-0.5 size-6 fill-current" strokeWidth={0} />
            </span>
          </button>
        )}
        {grip}
      </div>
      {footer}
    </div>
    </div>
  );
}

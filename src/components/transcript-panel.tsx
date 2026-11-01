import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { Sparkles, X } from "lucide-react";
import { Markdown } from "@/components/message-body";
import { TRANSCRIPT_MAX, TRANSCRIPT_MIN, useTranscriptPanel } from "@/hooks/use-transcript-panel";
import { useI18n } from "@/i18n/i18n-provider";
import { openLink } from "@/lib/links";
import { cn } from "@/lib/utils";

/** Barra laterale destra con la trascrizione aperta. Si ridimensiona trascinando il bordo sinistro. */
export function TranscriptPanel() {
  const { t } = useI18n();
  const panel = useTranscriptPanel();
  const [dragging, setDragging] = useState(false);
  if (!panel || !panel.content) return null;
  const { content, width, close, setWidth } = panel;

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // Il bordo destro del pannello coincide con quello della finestra.
    setWidth(window.innerWidth - e.clientX);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") setWidth(width + 16);
    else if (e.key === "ArrowRight") setWidth(width - 16);
    else return;
    e.preventDefault();
  };

  const isLink = content.source !== null && /^https?:\/\//i.test(content.source);

  return (
    <aside className="relative flex max-w-[70vw] shrink-0 flex-col border-l border-app-border bg-app-panel" style={{ width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("sidebar.resize")}
        aria-valuenow={width}
        aria-valuemin={TRANSCRIPT_MIN}
        aria-valuemax={TRANSCRIPT_MAX}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className={cn(
          "absolute inset-y-0 -left-[3px] z-10 w-1.5 cursor-col-resize outline-none transition-colors hover:bg-app-accent/40 focus-visible:bg-app-accent/60",
          dragging && "bg-app-accent/60",
        )}
      />
      <div className="flex shrink-0 items-center gap-2 border-b border-app-border px-4 py-3">
        <Sparkles className="size-4 text-app-ai" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold text-app-text-strong">{t("chat.transcribed")}</div>
          {content.source &&
            (isLink ? (
              <a
                href={content.source}
                rel="noreferrer noopener"
                onClick={(e) => {
                  e.preventDefault();
                  void openLink(content.source!);
                }}
                className="block truncate text-xs text-app-accent-text hover:underline"
              >
                {content.source}
              </a>
            ) : (
              <div className="truncate text-xs text-app-text-muted">{content.source}</div>
            ))}
        </div>
        <button
          type="button"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={close}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-app-text-muted hover:bg-app-field hover:text-app-text"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[15px] leading-relaxed break-words text-app-text">
        <Markdown text={content.body} />
      </div>
    </aside>
  );
}

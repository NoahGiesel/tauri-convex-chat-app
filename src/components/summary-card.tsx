import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, PanelRight, Sparkles } from "lucide-react";
import { MinimizableMedia } from "@/components/minimizable-media";
import { Markdown } from "@/components/message-body";
import { useTranscriptPanel } from "@/hooks/use-transcript-panel";
import { useI18n } from "@/i18n/i18n-provider";

const COLLAPSED_HEIGHT = 128; // circa 5 righe

/**
 * La trascrizione di un link o di un testo lungo: mentre il modello lavora un segnaposto con cerchio che gira,
 * poi un riquadro "Trascritto" che mostra le prime righe e si apre con "Espandi".
 */
export function SummaryCard({
  status,
  body,
  source = null,
  onLayout,
}: {
  status: "pending" | "done" | "failed";
  body: string;
  /** Il link o l'inizio del testo che è stato trascritto (mostrato nella barra laterale). */
  source?: string | null;
  onLayout?: () => void;
}) {
  const { t } = useI18n();
  const panel = useTranscriptPanel();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const content = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (status === "done" && content.current) setOverflows(content.current.scrollHeight > COLLAPSED_HEIGHT + 8);
  }, [status, body]);

  if (status === "pending") {
    return (
      <div role="status" className="mt-2 flex w-fit max-w-full items-center gap-2.5 rounded-[calc(14px*var(--radius-scale))] border border-app-ai-border bg-app-ai-bg px-3.5 py-2.5 text-sm text-app-ai">
        <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
        <span className="animate-pulse">{t("chat.summarizing")}</span>
      </div>
    );
  }

  if (status === "failed") {
    return <div className="mt-2 text-sm text-app-text-dim italic">{t("chat.transcribeFailed")}</div>;
  }

  const collapsed = overflows && !expanded;
  return (
    <MinimizableMedia
      className="mt-2 w-full max-w-[560px]"
      label={t("chat.showTranscript")}
      icon={<Sparkles className="size-4 text-app-ai" strokeWidth={1.9} />}
    >
    <div className="max-w-[560px] overflow-hidden rounded-[calc(14px*var(--radius-scale))] border border-app-ai-border bg-app-ai-bg">
      <div className="flex items-center gap-1.5 px-3.5 pt-2.5 text-xs font-bold tracking-wide text-app-ai uppercase">
        <Sparkles className="size-3.5" strokeWidth={2} />
        {t("chat.transcribed")}
      </div>
      <div className="relative px-3.5 pt-2 pb-2.5 text-[15px] leading-relaxed break-words text-app-text">
        <div ref={content} className="overflow-hidden" style={collapsed ? { maxHeight: COLLAPSED_HEIGHT } : undefined}>
          <Markdown text={body} />
        </div>
        {collapsed && <div className="pointer-events-none absolute inset-x-0 bottom-2.5 h-10 bg-gradient-to-t from-app-ai-bg to-transparent" />}
      </div>
      {(overflows || panel) && (
        <div className="flex divide-x divide-app-ai-border border-t border-app-ai-border">
          {overflows && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                setExpanded((e) => !e);
                requestAnimationFrame(() => onLayout?.());
              }}
              className="flex flex-1 items-center justify-center gap-1 py-1.5 text-[13px] font-semibold text-app-ai hover:bg-app-field/40"
            >
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {expanded ? t("chat.collapse") : t("chat.expand")}
            </button>
          )}
          {panel && (
            <button
              type="button"
              onClick={() => panel.open({ body, source })}
              className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[13px] font-semibold text-app-ai hover:bg-app-field/40"
            >
              <PanelRight className="size-4" />
              {t("chat.openInSidebar")}
            </button>
          )}
        </div>
      )}
    </div>
    </MinimizableMedia>
  );
}

import { Loader2 } from "lucide-react";
import { Markdown } from "@/components/message-body";
import { useI18n } from "@/i18n/i18n-provider";

/** La risposta di /ask: segnaposto con cerchio che gira mentre il modello pensa, poi il testo in markdown. */
export function AskCard({ status, body }: { status: "pending" | "done" | "failed"; body: string }) {
  const { t } = useI18n();

  if (status === "pending") {
    return (
      <div role="status" className="mt-2 flex w-fit max-w-full items-center gap-2.5 rounded-[calc(14px*var(--radius-scale))] border border-app-ai-border bg-app-ai-bg px-3.5 py-2.5 text-sm text-app-ai">
        <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
        <span className="animate-pulse">{t("chat.asking")}</span>
      </div>
    );
  }
  if (status === "failed") return <div className="mt-2 text-sm text-app-text-dim italic">{t("chat.askFailed")}</div>;

  return (
    <div className="mt-2 max-w-[560px] rounded-[calc(14px*var(--radius-scale))] border border-app-ai-border bg-app-ai-bg px-3.5 py-3 text-[15px] leading-relaxed break-words text-app-text">
      <Markdown text={body} />
    </div>
  );
}

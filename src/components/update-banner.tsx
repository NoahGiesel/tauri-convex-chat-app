import { Download } from "lucide-react";
import { useUpdater } from "@/hooks/use-updater";
import { useI18n } from "@/i18n/i18n-provider";

/** Barra in alto, visibile ovunque nell'app quando c'è una nuova versione (a meno che l'utente l'abbia nascosta). */
export function UpdateBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { status, version, progress, dismissed, hideNotices, install, dismiss } = useUpdater();
  const { t } = useI18n();

  if (status === "downloading") {
    return (
      <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-app-border bg-app-field px-4 py-1.5 text-sm text-app-text">
        <span>{t("update.downloading", { version: version ?? "" })}</span>
        <div className="h-2 max-w-xs flex-1 overflow-hidden rounded bg-app-border">
          <div className="h-full rounded bg-app-accent" style={{ width: `${Math.round((progress ?? 1) * 100)}%` }} />
        </div>
      </div>
    );
  }

  if (status !== "available" || dismissed || hideNotices) return null;

  const ghost = "h-[30px] rounded-lg px-2.5 text-[13px] font-semibold hover:bg-white/10";

  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-3 bg-app-accent px-4 py-1.5 text-sm text-app-accent-fg">
      <Download className="size-[18px]" strokeWidth={2} />
      <span className="min-w-[200px] flex-1">
        {t("update.available")} <strong>{version}</strong>
      </span>
      <button
        type="button"
        onClick={() => void install()}
        className="h-[30px] rounded-lg bg-app-accent-fg px-3.5 text-[13px] font-bold text-app-accent"
      >
        {t("update.updateNow")}
      </button>
      <button type="button" onClick={onOpenSettings} className={ghost}>
        {t("update.details")}
      </button>
      <button type="button" onClick={dismiss} className={ghost}>
        {t("update.later")}
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Check, MessageSquare } from "lucide-react";
import { Switch } from "@/components/switch";
import { useUpdater } from "@/hooks/use-updater";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { outlineButtonClass, primaryButtonClass } from "@/lib/ui-classes";

/** Impostazioni › Aggiornamenti, come nel design. */
export function SettingsUpdates() {
  const { status, version, notes, progress, error, lastChecked, hideNotices, setHideNotices, checkNow, install } =
    useUpdater();
  const { t, locale } = useI18n();
  const [current, setCurrent] = useState<string>("—");

  useEffect(() => {
    getVersion().then(setCurrent).catch(() => setCurrent("dev"));
  }, []);

  const busy = status === "checking" || status === "downloading";
  const percent = progress === null ? null : Math.round(progress * 100);

  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-app-text-strong">{t("settings.updates.title")}</h1>
        <p className="mt-2 text-[15px] text-app-text-muted">{t("settings.updates.subtitle")}</p>
      </div>

      <section className="flex flex-col gap-[18px] rounded-[18px] border border-app-border bg-app-panel p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex size-[52px] items-center justify-center rounded-[15px] bg-app-accent text-app-accent-fg">
            <MessageSquare className="size-[26px]" strokeWidth={2} />
          </div>
          <div className="min-w-[200px] flex-1">
            <div className="text-[13px] font-semibold text-app-text-muted">{t("settings.updates.installedLabel")}</div>
            <div className="text-[22px] font-extrabold text-app-text-strong">{current}</div>
          </div>
          {lastChecked && (
            <div className="text-[13px] text-app-text-dim">
              {t("settings.updates.lastCheckAt", {
                time: lastChecked.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
              })}
            </div>
          )}
        </div>

        {status === "up-to-date" && (
          <div className="flex items-center gap-3 rounded-xl bg-app-online-bg px-4 py-3.5 text-[15px] font-semibold text-app-online">
            <Check className="size-5" strokeWidth={2.2} />
            {t("settings.updates.upToDate")}
          </div>
        )}

        {status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {t("settings.updates.error", { message: error ?? "" })}
          </p>
        )}

        {(status === "available" || status === "downloading") && (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-full bg-app-accent-soft px-2.5 py-1 text-[13px] font-extrabold text-app-accent-text">
                {t("settings.updates.newVersion")}
              </span>
              <span className="text-lg font-extrabold text-app-text-strong">{version}</span>
            </div>
            {notes && (
              <div className="rounded-xl border border-app-border bg-app-bg p-4 text-sm leading-relaxed text-app-text">
                <div className="mb-1.5 font-extrabold text-app-text-strong">{t("settings.updates.whatsNew")}</div>
                <div className="whitespace-pre-wrap">{notes}</div>
              </div>
            )}
          </div>
        )}

        {status === "downloading" && (
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between text-sm font-semibold text-app-text">
              <span>{t("settings.updates.downloading")}</span>
              {percent !== null && <span className="text-app-accent-text">{percent}%</span>}
            </div>
            <div
              role="progressbar"
              aria-label={t("settings.updates.downloading")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent ?? undefined}
              className="h-2 overflow-hidden rounded bg-app-border"
            >
              <div className="h-full rounded bg-app-accent transition-[width]" style={{ width: `${percent ?? 100}%` }} />
            </div>
            <div className="text-[13px] text-app-text-dim">{t("settings.updates.restartNote")}</div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void checkNow(true)}
            className={cn(outlineButtonClass, "h-[46px] px-5 text-[15px]")}
          >
            {status === "checking" ? t("settings.updates.checking") : t("settings.updates.check")}
          </button>
          {status === "available" && (
            <button type="button" onClick={() => void install()} className={cn(primaryButtonClass, "h-[46px] px-[22px] text-[15px]")}>
              {t("settings.updates.install")}
            </button>
          )}
        </div>
      </section>

      <section className="rounded-[18px] border border-app-border bg-app-panel px-6 py-2">
        <div className="flex items-center gap-4 py-4">
          <div className="flex-1">
            <div className="text-[15px] font-bold text-app-text-strong">{t("settings.updates.notifyTitle")}</div>
            <div className="mt-0.5 text-[13px] text-app-text-muted">{t("settings.updates.notifyDescription")}</div>
          </div>
          <Switch
            checked={!hideNotices}
            onChange={(on) => setHideNotices(!on)}
            label={t("settings.updates.notifyTitle")}
          />
        </div>
      </section>
    </div>
  );
}

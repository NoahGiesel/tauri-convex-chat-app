import { useState } from "react";
import { Check, Play, Volume2, VolumeX } from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";
import {
  NOTIFICATION_SOUNDS,
  getNotificationSound,
  getNotificationVolume,
  playNotificationSound,
  setNotificationSound,
  setNotificationVolume,
  type NotificationSoundId,
} from "@/lib/notification-sound";
import { cn } from "@/lib/utils";

/** Impostazioni › Notifiche: scelta del suono dei nuovi messaggi, con anteprima. */
export function SettingsNotifications() {
  const { t } = useI18n();
  const [selected, setSelected] = useState<NotificationSoundId>(getNotificationSound);
  const [volume, setVolume] = useState(getNotificationVolume);

  function choose(id: NotificationSoundId) {
    setSelected(id);
    setNotificationSound(id);
    playNotificationSound(id, true);
  }

  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-app-text-strong">{t("settings.nav.notifications")}</h1>
        <p className="mt-2 text-[15px] text-app-text-muted">{t("settings.notifications.subtitle")}</p>
      </div>

      <section className="flex flex-col gap-3 rounded-[calc(18px*var(--radius-scale))] border border-app-border bg-app-panel p-6">
        <div>
          <h2 className="text-lg font-extrabold text-app-text-strong">{t("settings.notifications.sound")}</h2>
          <p className="mt-1 text-sm text-app-text-muted">{t("settings.notifications.soundDescription")}</p>
        </div>
        <div className="flex items-center gap-3 pb-1">
          {volume === 0 ? <VolumeX className="size-5 shrink-0 text-app-text-muted" strokeWidth={1.9} /> : <Volume2 className="size-5 shrink-0 text-app-text-muted" strokeWidth={1.9} />}
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={volume}
            aria-label={t("settings.notifications.volume")}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              setNotificationVolume(v);
            }}
            onPointerUp={() => playNotificationSound(selected, true)}
            onKeyUp={() => playNotificationSound(selected, true)}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-app-accent"
          />
          <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-app-text-soft">{volume}%</span>
        </div>
        <div role="radiogroup" aria-label={t("settings.notifications.sound")} className="flex flex-col gap-2">
          {NOTIFICATION_SOUNDS.map((s) => {
            const current = s.id === selected;
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-[calc(14px*var(--radius-scale))] border px-4 py-3",
                  current ? "border-app-accent-soft-border bg-app-accent-soft" : "border-app-border bg-app-bg",
                )}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={current}
                  onClick={() => choose(s.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className={cn("flex size-5 items-center justify-center rounded-full border", current ? "border-app-accent bg-app-accent text-white" : "border-app-border-strong")}>
                    {current && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className={cn("text-[15px]", current ? "font-bold text-app-text-strong" : "font-semibold text-app-text")}>{s.label}</span>
                </button>
                <button
                  type="button"
                  aria-label={t("settings.notifications.preview", { name: s.label })}
                  title={t("settings.notifications.preview", { name: s.label })}
                  onClick={() => playNotificationSound(s.id, true)}
                  className="flex size-9 items-center justify-center rounded-[calc(10px*var(--radius-scale))] text-app-text-muted hover:bg-app-field hover:text-app-text"
                >
                  <Play className="size-4" strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Switch } from "@/components/switch";
import { useI18n } from "@/i18n/i18n-provider";
import { readAutostart, setAutostart } from "@/lib/autostart";

/** Preferenze › avvio all'accesso. Lo stato si legge dal sistema a ogni apertura; fuori dall'app desktop la voce non compare. */
export function SettingsAutostart() {
  const { t } = useI18n();
  // `null` finché il sistema non risponde, e anche dopo se non si può leggere: in entrambi i casi la voce non compare.
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void readAutostart().then((state) => {
      if (alive) setOn(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (on === null) return null;

  return (
    <section className="flex items-center gap-4 rounded-[calc(18px*var(--radius-scale))] border border-app-border bg-app-panel px-6 py-5">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-app-text-strong">{t("settings.autostart.title")}</div>
        <div className="mt-0.5 text-[13px] text-app-text-muted">{t("settings.autostart.description")}</div>
      </div>
      <Switch
        checked={on}
        label={t("settings.autostart.title")}
        onChange={(next) => {
          if (busy) return;
          setBusy(true);
          void setAutostart(next).then((state) => {
            setOn(state);
            setBusy(false);
          });
        }}
      />
    </section>
  );
}

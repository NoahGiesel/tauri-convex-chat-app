import { useState } from "react";
import { useI18n } from "@/i18n/i18n-provider";
import { getPingCompact, getPingPlace, PING_PLACES, setPingCompact, setPingPlace, type PingPlace } from "@/lib/ping-pref";

export function SettingsPing() {
  const { t } = useI18n();
  const [value, setValue] = useState<PingPlace>(getPingPlace);
  const [compact, setCompact] = useState(getPingCompact);

  return (
    <section className="flex flex-col gap-4 rounded-[calc(18px*var(--radius-scale))] border border-app-border bg-app-panel px-6 py-5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-app-text-strong">{t("settings.ping.title")}</div>
          <div className="mt-0.5 text-[13px] text-app-text-muted">{t("settings.ping.description")}</div>
        </div>
        <select
          aria-label={t("settings.ping.title")}
          value={value}
          onChange={(e) => {
            const v = e.target.value as PingPlace;
            setValue(v);
            setPingPlace(v);
          }}
          className="h-10 w-44 rounded-xl border border-app-border-strong bg-app-field px-3 text-sm font-semibold text-app-text outline-none transition-colors focus:border-app-accent-bright"
        >
          {PING_PLACES.map((p) => (
            <option key={p} value={p}>
              {t(`settings.ping.${p}` as const)}
            </option>
          ))}
        </select>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-app-text">
        <input
          type="checkbox"
          checked={compact}
          disabled={value === "off"}
          onChange={(e) => {
            setCompact(e.target.checked);
            setPingCompact(e.target.checked);
          }}
          className="size-4 accent-[var(--color-app-accent)]"
        />
        {t("settings.ping.compact")}
      </label>
    </section>
  );
}

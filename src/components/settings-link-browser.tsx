import { useState } from "react";
import { useI18n } from "@/i18n/i18n-provider";
import { availableBrowsers, getLinkBrowser, setLinkBrowser, type BrowserId } from "@/lib/link-browser";

export function SettingsLinkBrowser() {
  const { t } = useI18n();
  const [value, setValue] = useState<BrowserId>(getLinkBrowser);

  return (
    <section className="flex items-center gap-4 rounded-[calc(18px*var(--radius-scale))] border border-app-border bg-app-panel px-6 py-5">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-app-text-strong">{t("settings.linkBrowser.title")}</div>
        <div className="mt-0.5 text-[13px] text-app-text-muted">{t("settings.linkBrowser.description")}</div>
      </div>
      <select
        aria-label={t("settings.linkBrowser.title")}
        value={value}
        onChange={(e) => {
          const id = e.target.value as BrowserId;
          setValue(id);
          setLinkBrowser(id);
        }}
        className="h-10 w-44 rounded-xl border border-app-border-strong bg-app-field px-3 text-sm font-semibold text-app-text outline-none transition-colors focus:border-app-accent-bright"
      >
        {availableBrowsers().map((b) => (
          <option key={b} value={b}>
            {b === "system" ? t("settings.linkBrowser.system") : LABELS[b]}
          </option>
        ))}
      </select>
    </section>
  );
}

const LABELS: Record<Exclude<BrowserId, "system">, string> = {
  chrome: "Chrome",
  safari: "Safari",
  firefox: "Firefox",
  edge: "Edge",
  arc: "Arc",
  brave: "Brave",
};

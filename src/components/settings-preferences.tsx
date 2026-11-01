import { SettingsLanguage } from "@/components/settings-language";
import { SettingsLinkBrowser } from "@/components/settings-link-browser";
import { useI18n } from "@/i18n/i18n-provider";

export function SettingsPreferences() {
  const { t } = useI18n();

  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-app-text-strong">{t("settings.nav.preferences")}</h1>
        <p className="mt-2 text-[15px] text-app-text-muted">{t("settings.preferences.subtitle")}</p>
      </div>
      <SettingsLanguage />
      <SettingsLinkBrowser />
    </div>
  );
}

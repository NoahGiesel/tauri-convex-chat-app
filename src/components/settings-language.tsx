import { LanguageSelect } from "@/components/language-select";
import { useI18n } from "@/i18n/i18n-provider";

export function SettingsLanguage() {
  const { t } = useI18n();

  return (
    <section className="flex items-center gap-4 rounded-[calc(18px*var(--radius-scale))] border border-app-border bg-app-panel px-6 py-5">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-app-text-strong">{t("settings.language.title")}</div>
        <div className="mt-0.5 text-[13px] text-app-text-muted">{t("settings.language.description")}</div>
      </div>
      <LanguageSelect className="w-44" />
    </section>
  );
}

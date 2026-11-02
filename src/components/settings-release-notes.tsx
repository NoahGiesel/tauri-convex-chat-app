import { useAppVersion } from "@/hooks/use-app-version";
import { useI18n } from "@/i18n/i18n-provider";
import { RELEASE_NOTES } from "@/data/release-notes";

/** Impostazioni › Note di rilascio: cosa è cambiato in ogni versione. */
export function SettingsReleaseNotes() {
  const { t, language } = useI18n();
  const current = useAppVersion();

  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-app-text-strong">{t("settings.nav.releaseNotes")}</h1>
        <p className="mt-2 text-[15px] text-app-text-muted">{t("settings.releaseNotes.subtitle")}</p>
      </div>

      {RELEASE_NOTES.map((release) => {
        const items = (language === "it" ? release.items.it : undefined) ?? release.items.en;
        const isCurrent = release.version === current;
        return (
          <section
            key={release.version}
            className="flex flex-col gap-3 rounded-[calc(18px*var(--radius-scale))] border border-app-border bg-app-panel p-6"
          >
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-extrabold text-app-text-strong">
                {release.version === "next" ? t("settings.releaseNotes.next") : `v${release.version}`}
              </h2>
              {isCurrent && (
                <span className="rounded-md bg-app-accent px-2 py-0.5 text-[11px] font-bold text-app-accent-fg">
                  {t("settings.releaseNotes.installed")}
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-1.5 text-[15px] text-app-text">
              {items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-app-text-dim">•</span>
                  <span className="min-w-0 flex-1">{item}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

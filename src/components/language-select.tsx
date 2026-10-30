import { LANGUAGES, useI18n, type Language } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/** Selettore lingua: usato nella schermata di accesso/registrazione e nelle impostazioni. */
export function LanguageSelect({ id, className }: { id?: string; className?: string }) {
  const { language, setLanguage, t } = useI18n();

  return (
    <select
      id={id}
      aria-label={t("auth.language")}
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
      className={cn(
        "h-10 rounded-xl border border-app-border-strong bg-app-field px-3 text-sm font-semibold text-app-text outline-none transition-colors focus:border-app-accent-bright",
        className,
      )}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

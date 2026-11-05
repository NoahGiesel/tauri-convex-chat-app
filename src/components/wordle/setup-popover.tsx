import { useState } from "react";
import { useI18n } from "@/i18n/i18n-provider";
import { outlineButtonClass, primaryButtonClass, sectionLabelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { WORDLE_LANGUAGE_NAME, type RunMinutes, type WordleLanguage } from "@/lib/wordle";
import { RUN_MINUTES, WORDLE_LANGUAGES } from "../../../convex/wordleRules";

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  render: (value: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className={sectionLabelClass}>{label}</span>
      <div className="flex gap-1 rounded-xl border border-app-border bg-app-bg p-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === value}
            onClick={() => onChange(o)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
              o === value ? "bg-app-accent text-app-accent-fg" : "text-app-text hover:bg-app-field",
            )}
          >
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Il pannellino di `/wordle` sopra il campo di scrittura: Run timer, lingua della parola, invio. */
export function WordleSetupPopover({
  onSend,
  onCancel,
}: {
  onSend: (runMinutes: RunMinutes, language: WordleLanguage) => void;
  onCancel: () => void;
}) {
  const { t, language: appLanguage } = useI18n();
  const [runMinutes, setRunMinutes] = useState<RunMinutes>(5);
  const [language, setLanguage] = useState<WordleLanguage>(appLanguage === "it" ? "it" : "en");

  return (
    <div
      role="dialog"
      aria-label={t("wordle.setupTitle")}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="absolute bottom-full left-0 z-30 mb-2 flex w-[min(320px,100%)] flex-col gap-3 rounded-xl border border-app-border-strong bg-app-panel p-3 shadow-xl"
    >
      <div className="text-sm font-extrabold text-app-text-strong">{t("wordle.setupTitle")}</div>
      <Segmented
        label={t("wordle.runTimer")}
        options={RUN_MINUTES}
        value={runMinutes}
        onChange={setRunMinutes}
        render={(n) => t("wordle.minutes", { n })}
      />
      <Segmented
        label={t("wordle.wordLanguage")}
        options={WORDLE_LANGUAGES}
        value={language}
        onChange={setLanguage}
        render={(l) => WORDLE_LANGUAGE_NAME[l]}
      />
      <div className="flex gap-2">
        <button type="button" autoFocus onClick={() => onSend(runMinutes, language)} className={cn(primaryButtonClass, "h-9 flex-1 text-sm")}>
          {t("wordle.send")}
        </button>
        <button type="button" onClick={onCancel} className={cn(outlineButtonClass, "h-9 px-3 text-sm")}>
          {t("wordle.cancel")}
        </button>
      </div>
    </div>
  );
}

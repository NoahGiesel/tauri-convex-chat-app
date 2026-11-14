import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/i18n-provider";
import { outlineButtonClass, primaryButtonClass, sectionLabelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { CLUE_NAME, ZONE_NAME } from "@/lib/geo";
import { GEO_CLUES, GEO_ROUNDS, GEO_ZONES, type GeoClue, type GeoRounds, type GeoZone } from "../../../convex/geoRules";

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
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

/** Il pannellino di `/geo` sopra il campo di scrittura: Zone (da scegliere, nessuna di partenza), Round, indizio, invio. */
export function GeoSetupPopover({ onSend, onCancel }: { onSend: (zone: GeoZone, rounds: GeoRounds, clue: GeoClue) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [zone, setZone] = useState<GeoZone | null>(null);
  const [rounds, setRounds] = useState<GeoRounds>(5);
  const [clue, setClue] = useState<GeoClue>("name");
  const boxRef = useRef<HTMLDivElement>(null);

  // Un clic fuori dal pannello lo chiude, come Esc.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onCancel]);

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={t("geo.setupTitle")}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      className="absolute bottom-full left-0 z-30 mb-2 flex w-[min(340px,100%)] flex-col gap-3 rounded-xl border border-app-border-strong bg-app-panel p-3 shadow-xl"
    >
      <div className="text-sm font-extrabold text-app-text-strong">{t("geo.setupTitle")}</div>
      <Segmented label={t("geo.zone")} options={GEO_ZONES} value={zone} onChange={setZone} render={(z) => t(ZONE_NAME[z])} />
      <Segmented label={t("geo.roundCount")} options={GEO_ROUNDS} value={rounds} onChange={setRounds} render={(n) => t("geo.rounds", { n })} />
      <Segmented label={t("geo.clue")} options={GEO_CLUES} value={clue} onChange={setClue} render={(c) => t(CLUE_NAME[c])} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={zone === null}
          onClick={() => zone && onSend(zone, rounds, clue)}
          className={cn(primaryButtonClass, "h-9 flex-1 text-sm")}
        >
          {t("wordle.send")}
        </button>
        <button type="button" autoFocus onClick={onCancel} className={cn(outlineButtonClass, "h-9 px-3 text-sm")}>
          {t("wordle.cancel")}
        </button>
      </div>
    </div>
  );
}

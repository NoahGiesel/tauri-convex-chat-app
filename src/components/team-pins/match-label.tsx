import { useI18n } from "@/i18n/i18n-provider";
import type { ChipState } from "@/lib/match-chip";
import { cn } from "@/lib/utils";

/** Gli stati in cui si sta giocando: il pallino rosso pulsa. */
export const LIVE_KINDS: ChipState["kind"][] = ["live", "halftime", "shootout"];

/** Il pallino della diretta; fermo e grigio se la partita è sospesa o il dato non arriva più. */
export function LiveDot({ still }: { still: boolean }) {
  return (
    <span className="relative flex size-2 shrink-0">
      {!still && <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />}
      <span className={cn("relative inline-flex size-2 rounded-full", still ? "bg-app-text-dim" : "bg-red-500")} />
    </span>
  );
}

/** L'etichetta accanto al punteggio: minuto, Intervallo, Finale, d.t.s., rigori, rinvii… */
export function StateLabel({ state, when, time }: { state: ChipState; when: string; time: string }) {
  const { t } = useI18n();
  switch (state.kind) {
    case "next":
      return <span className="tabular-nums">{when}</span>;
    case "delayed":
      return (
        <>
          <span className="tabular-nums">{time}</span> · {t("teamPins.delayed")}
        </>
      );
    case "live":
      return <span className="font-bold text-red-500 tabular-nums">{state.minute}</span>;
    case "halftime":
      return <span className="font-bold text-red-500">{t("teamPins.ht")}</span>;
    case "shootout":
      return (
        <span className="font-bold text-red-500 tabular-nums">
          · {t("teamPins.pensLive")} {state.shootout.home}–{state.shootout.away}
        </span>
      );
    case "finished":
      if (state.ending === "pens" && state.shootout) {
        return (
          <span className="tabular-nums">
            · {state.shootout.home}–{state.shootout.away} {t("teamPins.pens")}
          </span>
        );
      }
      return <>{t(state.ending === "aet" ? "teamPins.aet" : "teamPins.ft")}</>;
    case "suspended":
      return <>{t("teamPins.suspended")}</>;
    case "abandoned":
      return <>{t("teamPins.abandoned")}</>;
    case "postponed":
    case "cancelled":
      return (
        <>
          <span className="tabular-nums line-through">{when}</span> · {t(state.kind === "postponed" ? "teamPins.postponed" : "teamPins.cancelled")}
        </>
      );
  }
}

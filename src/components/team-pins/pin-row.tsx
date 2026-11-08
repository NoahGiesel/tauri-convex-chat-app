import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Crest } from "@/components/team-pins/crest";
import { useI18n } from "@/i18n/i18n-provider";
import { teamChips, type TeamChip, type TeamPin } from "@/lib/team-pins";

/** La fila dei chip delle squadre pinnate, sotto l'intestazione della chat: alta 44px, scorre di lato se non ci sta. */
export function TeamPinRow({ conversationId }: { conversationId: Id<"conversations"> }) {
  const { t } = useI18n();
  const pins = useQuery(api.teamPins.list, { conversationId });
  if (!pins || pins.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-app-border">
      <div role="list" aria-label={t("teamPins.row")} className="flex h-11 items-center gap-2 overflow-x-auto px-5">
        {teamChips(pins).map((chip) => (
          <Chip key={chip.key} chip={chip} />
        ))}
      </div>
    </div>
  );
}

function Chip({ chip }: { chip: TeamChip }) {
  const { t, locale } = useI18n();
  const { match } = chip;
  return (
    <div
      role="listitem"
      data-testid="team-pin-chip"
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-app-border bg-app-field/50 pr-1 pl-2 text-xs"
    >
      {match ? (
        <>
          <Crest logo={match.home.logo} abbreviation={match.home.abbreviation} />
          <span className="font-bold text-app-text-strong">{match.home.abbreviation}</span>
          <span className="text-app-text-muted">–</span>
          <span className="font-bold text-app-text-strong">{match.away.abbreviation}</span>
          <Crest logo={match.away.logo} abbreviation={match.away.abbreviation} />
          <span className="ml-1 text-app-text-muted tabular-nums">
            {new Date(match.kickoff).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </>
      ) : (
        <>
          <Crest logo={chip.pins[0].team.logo} abbreviation={chip.pins[0].team.abbreviation} />
          <span className="font-bold text-app-text-strong">{chip.pins[0].team.abbreviation}</span>
          <span className="ml-1 text-app-text-muted">{t("teamPins.noMatch")}</span>
        </>
      )}
      <RemoveButton pins={chip.pins} />
    </div>
  );
}

/** La X del chip. Un derby tiene due pin, quindi chiede quale togliere. */
function RemoveButton({ pins }: { pins: TeamPin[] }) {
  const { t } = useI18n();
  const remove = useMutation(api.teamPins.remove);
  const button = useRef<HTMLButtonElement>(null);
  // Il menu sta fuori dalla fila (che scorre e lo taglierebbe): si posiziona sotto la X.
  const [menuAt, setMenuAt] = useState<{ top: number; right: number } | null>(null);
  const unpin = (pin: TeamPin) => void remove({ pinId: pin.pinId }).catch((e) => console.error(e));

  useEffect(() => {
    if (!menuAt) return;
    // Il menu è fisso sullo schermo: si chiude a ogni clic fuori, con Esc e appena qualcosa scorre.
    const close = () => setMenuAt(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuAt]);

  const label = pins.length === 1 ? t("teamPins.unpin", { team: pins[0].team.name }) : t("teamPins.unpinWhich");
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={pins.length > 1 ? menuAt !== null : undefined}
        // Senza questo, il clic sulla X chiuderebbe il menu (pointerdown) e lo riaprirebbe subito (click).
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          if (pins.length === 1) return unpin(pins[0]);
          const rect = button.current!.getBoundingClientRect();
          setMenuAt((open) => (open ? null : { top: rect.bottom + 4, right: window.innerWidth - rect.right }));
        }}
        className="flex size-5 items-center justify-center rounded-md text-app-text-dim hover:bg-app-field hover:text-app-text"
      >
        <X className="size-3.5" strokeWidth={2.4} />
      </button>
      {menuAt && (
        <div
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          style={{ top: menuAt.top, right: menuAt.right }}
          className="fixed z-50 flex w-48 flex-col rounded-lg border border-app-border-strong bg-app-panel p-1 shadow-xl"
        >
          {pins.map((pin) => (
            <button
              key={pin.pinId}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuAt(null);
                unpin(pin);
              }}
              className="rounded-md px-2.5 py-1.5 text-left text-[13px] text-app-text hover:bg-app-field"
            >
              {t("teamPins.unpin", { team: pin.team.name })}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

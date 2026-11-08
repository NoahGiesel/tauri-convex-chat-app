import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Crest } from "@/components/team-pins/crest";
import { useI18n } from "@/i18n/i18n-provider";
import { chipState, isUnavailable, type ChipState } from "@/lib/match-chip";
import { teamChips, type TeamChip, type TeamPin } from "@/lib/team-pins";
import { cn } from "@/lib/utils";

/** Ogni quanto il chip ricontrolla l'ora: decide quale partita mostrare e se il dato è vecchio. */
const CLOCK_TICK_MS = 15_000;

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** La fila dei chip delle squadre pinnate, sotto l'intestazione della chat: alta 44px, scorre di lato se non ci sta. */
export function TeamPinRow({ conversationId }: { conversationId: Id<"conversations"> }) {
  const { t } = useI18n();
  const pins = useQuery(api.teamPins.list, { conversationId });
  const now = useNow(CLOCK_TICK_MS);
  if (!pins || pins.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-app-border">
      <div role="list" aria-label={t("teamPins.row")} className="flex h-11 items-center gap-2 overflow-x-auto px-5">
        {teamChips(pins, now).map((chip) => (
          <Chip key={chip.key} chip={chip} now={now} />
        ))}
      </div>
    </div>
  );
}

function LiveDot({ still }: { still: boolean }) {
  return (
    <span className="relative flex size-2 shrink-0">
      {!still && <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />}
      <span className={cn("relative inline-flex size-2 rounded-full", still ? "bg-app-text-dim" : "bg-red-500")} />
    </span>
  );
}

const LIVE_KINDS: ChipState["kind"][] = ["live", "halftime", "shootout"];

function Chip({ chip, now }: { chip: TeamChip; now: number }) {
  const { t, locale } = useI18n();
  const { match } = chip;
  if (!match) {
    const team = chip.pins[0].team;
    return (
      <ChipFrame chip={chip}>
        <Crest logo={team.logo} abbreviation={team.abbreviation} />
        <span className="font-bold text-app-text-strong">{team.abbreviation}</span>
        <span className="ml-1 text-app-text-muted">{t("teamPins.noMatch")}</span>
      </ChipFrame>
    );
  }

  const state = chipState(match);
  const stale = isUnavailable(match, now);
  const time = (ts: number) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const when = new Date(match.kickoff).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const unavailable = stale ? t("teamPins.unavailable", { time: time(match.fetchedAt) }) : undefined;
  const winner = state.kind === "finished" ? state.winner : null;

  return (
    <ChipFrame chip={chip} title={unavailable} stateKind={state.kind}>
      <div className={cn("flex items-center gap-1.5", stale && "opacity-50")}>
        {LIVE_KINDS.includes(state.kind) && <LiveDot still={stale} />}
        {state.kind === "suspended" && <LiveDot still />}
        <Crest logo={match.home.logo} abbreviation={match.home.abbreviation} />
        <span className={cn("text-app-text-strong", winner === "away" ? "font-medium" : "font-bold")}>{match.home.abbreviation}</span>
        <span className={cn("tabular-nums", "score" in state ? "font-black text-app-text-strong" : "text-app-text-muted")}>
          {"score" in state ? `${state.score.home}–${state.score.away}` : "–"}
        </span>
        <span className={cn("text-app-text-strong", winner === "home" ? "font-medium" : "font-bold")}>{match.away.abbreviation}</span>
        <Crest logo={match.away.logo} abbreviation={match.away.abbreviation} />
        <span className="ml-1 text-app-text-muted">
          <StateLabel state={state} when={when} time={time(match.kickoff)} />
        </span>
      </div>
      {stale && <AlertTriangle aria-label={unavailable} className="size-3.5 shrink-0 text-amber-500" strokeWidth={2.2} />}
    </ChipFrame>
  );
}

/** L'etichetta accanto al punteggio: minuto, Intervallo, Finale, d.t.s., rigori, rinvii… */
function StateLabel({ state, when, time }: { state: ChipState; when: string; time: string }) {
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

function ChipFrame({ chip, title, stateKind, children }: { chip: TeamChip; title?: string; stateKind?: ChipState["kind"]; children: React.ReactNode }) {
  return (
    <div
      role="listitem"
      data-testid="team-pin-chip"
      data-state={stateKind ?? "none"}
      title={title}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-app-border bg-app-field/50 pr-1 pl-2 text-xs"
    >
      {children}
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

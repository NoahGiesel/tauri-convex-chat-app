import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Crest } from "@/components/team-pins/crest";
import { MatchDrawer } from "@/components/team-pins/match-drawer";
import { StateLabel, StatusDot, useMatchTimes } from "@/components/team-pins/match-label";
import type { DrawerSlot } from "@/hooks/use-drawer-slot";
import { useMatchDrawer } from "@/hooks/use-match-drawer";
import { useI18n } from "@/i18n/i18n-provider";
import { chipState, isUnavailable, type ChipState } from "@/lib/match-chip";
import { teamIdsOf } from "@/lib/match-drawer";
import type { OpenedMatch } from "@/lib/match-schedule";
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

/**
 * La fila dei chip delle squadre pinnate, sotto l'intestazione della chat: alta 44px, scorre di lato se non ci sta.
 * Il drawer del chip aperto vive fuori dalla colonna della chat, nello spazio che le sta di fianco: così la chat
 * si restringe invece di finirci sotto, e nella finestra stretta lo copre. La fila dei chip resta sempre fuori
 * dal drawer, così i suoi chip si possono ancora cliccare.
 */
export function TeamPinRow({
  conversationId,
  drawer,
}: {
  conversationId: Id<"conversations">;
  /** Lo spazio del drawer accanto alla chat e la disposizione scelta per questa finestra. */
  drawer: DrawerSlot;
}) {
  const { t } = useI18n();
  const pins = useQuery(api.teamPins.list, { conversationId });
  const now = useNow(CLOCK_TICK_MS);
  const chips = useMemo(() => teamChips(pins ?? [], now), [pins, now]);
  const pinnedTeamIds = useMemo(() => chips.flatMap(teamIdsOf), [chips]);
  const drawerState = useMatchDrawer(conversationId, chips, pins ? pinnedTeamIds : null);
  /** I pulsanti dei chip: chiudendo con la X o con Esc il focus torna su quello che aveva aperto il drawer. */
  const chipButtons = useRef(new Map<string, HTMLButtonElement>());
  /** La partita vecchia aperta dal tab Partite: vive nel drawer, e si perde quando cambia o si chiude il chip. */
  const [opened, setOpened] = useState<OpenedMatch | null>(null);
  const open = drawerState.chip;
  const openKey = open?.key ?? null;

  // Cambiare chip o chiudere il drawer riporta alla partita del chip.
  useEffect(() => {
    setOpened(null);
  }, [openKey]);
  if (!pins || pins.length === 0) return null;

  const openChip = (chip: TeamChip) => {
    // Un secondo clic sul chip di una partita vecchia torna alla partita del chip, non chiude il drawer.
    if (drawerState.isOpen(chip) && opened) {
      setOpened(null);
      return;
    }
    drawerState.toggle(chip);
  };

  const closeDrawer = () => {
    const shownKey = open?.key;
    drawerState.close();
    if (shownKey) chipButtons.current.get(shownKey)?.focus();
  };

  const trackButton = (key: string) => (button: HTMLButtonElement | null) => {
    if (button) chipButtons.current.set(key, button);
    else chipButtons.current.delete(key);
  };

  return (
    <>
      <div data-team-pin-row className="shrink-0 border-b border-app-border">
        <div role="list" aria-label={t("teamPins.row")} className="flex h-11 items-center gap-2 overflow-x-auto px-5">
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              chip={chip}
              now={now}
              open={drawerState.isOpen(chip)}
              onOpen={() => openChip(chip)}
              buttonRef={trackButton(chip.key)}
            />
          ))}
        </div>
      </div>
      {open?.match &&
        drawer.slot &&
        createPortal(
          <MatchDrawer
            conversationId={conversationId}
            team={open.pins[0].team}
            match={open.match}
            otherTeamIds={[...new Set(pinnedTeamIds)].filter((id) => id !== open.pins[0].team.teamId)}
            opened={opened}
            onOpen={(match) => setOpened({ match, requestedAt: Date.now() })}
            onBack={() => setOpened(null)}
            now={now}
            layout={drawer.layout}
            onClose={closeDrawer}
          />,
          drawer.slot,
        )}
    </>
  );
}

function Chip({
  chip,
  now,
  open,
  onOpen,
  buttonRef,
}: {
  chip: TeamChip;
  now: number;
  open: boolean;
  onOpen: () => void;
  /** Serve a rimettere il focus sul chip quando il drawer si chiude. */
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const { t } = useI18n();
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
  const { when, time, clock } = useMatchTimes(match);
  const unavailable = stale ? t("teamPins.unavailable", { time: clock(match.fetchedAt) }) : undefined;
  const winner = state.kind === "finished" ? state.winner : null;

  return (
    <ChipFrame chip={chip} title={unavailable} stateKind={state.kind} open={open}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onOpen}
        className={cn("flex items-center gap-1.5 rounded-full text-left", stale && "opacity-50")}
      >
        <StatusDot state={state} stale={stale} />
        <Crest logo={match.home.logo} abbreviation={match.home.abbreviation} />
        <span className={cn("text-app-text-strong", winner === "away" ? "font-medium" : "font-bold")}>{match.home.abbreviation}</span>
        <span className={cn("tabular-nums", "score" in state ? "font-black text-app-text-strong" : "text-app-text-muted")}>
          {"score" in state ? `${state.score.home}–${state.score.away}` : "–"}
        </span>
        <span className={cn("text-app-text-strong", winner === "home" ? "font-medium" : "font-bold")}>{match.away.abbreviation}</span>
        <Crest logo={match.away.logo} abbreviation={match.away.abbreviation} />
        <span className="ml-1 text-app-text-muted">
          <StateLabel state={state} when={when} time={time} />
        </span>
      </button>
      {stale && <AlertTriangle aria-label={unavailable} className="size-3.5 shrink-0 text-amber-500" strokeWidth={2.2} />}
    </ChipFrame>
  );
}

function ChipFrame({
  chip,
  title,
  stateKind,
  open = false,
  children,
}: {
  chip: TeamChip;
  title?: string;
  stateKind?: ChipState["kind"];
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="listitem"
      data-testid="team-pin-chip"
      data-state={stateKind ?? "none"}
      title={title}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-1 pl-2 text-xs",
        open ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-app-field/50 hover:bg-app-field",
      )}
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

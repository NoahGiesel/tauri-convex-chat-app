import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangle, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Crest } from "@/components/team-pins/crest";
import { StateLabel, StatusDot, useMatchTimes } from "@/components/team-pins/match-label";
import type { MessageKey } from "@/i18n/en";
import { useI18n } from "@/i18n/i18n-provider";
import { chipState, isUnavailable, type PinMatch } from "@/lib/match-chip";
import { isStale, DRAWER_WIDTH, type DrawerLayout } from "@/lib/match-drawer";
import {
  competitionTag,
  DETAILS_TIMEOUT_MS,
  matchOutcome,
  matchesTab,
  matchTitle,
  openedMatchView,
  opensMatch,
  rowTail,
  type MatchOutcome,
  type MatchesTabView,
  type OpenedMatch,
  type ScheduleMatch,
  type TeamSchedule,
  type TeamView,
} from "@/lib/match-schedule";
import {
  pitchView,
  playerMarks,
  readableInk,
  type PitchMarker,
  type PitchView,
  type PlayerMarks,
  type SideKey,
} from "@/lib/match-pitch";
import { cn } from "@/lib/utils";

/** I dettagli come li manda `footballMatches.details`. */
type Details = NonNullable<FunctionReturnType<typeof api.footballMatches.details>>;

const STAT_LABELS: Record<Details["stats"][number]["key"], MessageKey> = {
  possession: "teamPins.possession",
  shots: "teamPins.shots",
  shotsOnTarget: "teamPins.shotsOnTarget",
  corners: "teamPins.corners",
  fouls: "teamPins.fouls",
  offsides: "teamPins.offsides",
};

const EVENT_ICONS: Record<Details["events"][number]["kind"], string> = {
  goal: "⚽",
  penaltyGoal: "⚽",
  ownGoal: "⚽",
  yellowCard: "🟨",
  redCard: "🟥",
  substitution: "🔁",
};

const OUTCOME_LABELS: Record<MatchOutcome, MessageKey> = {
  win: "teamPins.win",
  draw: "teamPins.draw",
  loss: "teamPins.loss",
};

type DrawerTab = "match" | "matches";

/** I tab del drawer, nell'ordine in cui compaiono. */
const TABS: { kind: DrawerTab; testId: string; label: MessageKey }[] = [
  { kind: "match", testId: "tab-match", label: "teamPins.tabMatch" },
  { kind: "matches", testId: "tab-matches", label: "teamPins.tabMatches" },
];

/**
 * Il drawer di una partita: intestazione, tab, poi Lineups, Bench, Events e Stats. Una sezione senza dati non compare,
 * quindi prima delle formazioni c'è solo il tab vuoto. Sta di fianco alla chat, che si restringe, oppure la copre
 * quando è troppo stretta (docs/MATCH-DRAWER-SPEC.md, Layout and closing). Si chiude con la X, con un secondo clic
 * sul suo chip o con Esc mentre il focus è dentro: un clic fuori no, e nemmeno Esc nel campo del messaggio.
 */
export function MatchDrawer({
  conversationId,
  team,
  match,
  opened,
  onOpen,
  onBack,
  now,
  layout,
  onClose,
}: {
  conversationId: Id<"conversations">;
  /** La squadra pinnata del chip: il tab Partite mostra il suo calendario. */
  team: TeamView;
  match: PinMatch;
  /** La partita vecchia aperta dal tab Partite, se c'è: vive solo finché il drawer è aperto. */
  opened: OpenedMatch | null;
  /** Apre una partita vecchia: la riga del tab Partite o il "Try again". */
  onOpen: (match: ScheduleMatch) => void;
  /** Torna alla partita del chip. */
  onBack: () => void;
  now: number;
  layout: DrawerLayout;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const openPast = useMutation(api.footballMatches.openPast);
  // La partita mostrata: quella del chip, oppure quella vecchia aperta dal tab Partite.
  const shown = opened ? openedMatchView(opened.match, team, opened.requestedAt) : match;
  const details = useQuery(api.footballMatches.details, { conversationId, eventId: shown.eventId });
  const schedule = useQuery(api.footballTeamSchedules.forPin, { conversationId, teamId: team.teamId });
  const state = chipState(shown);
  const stale = isUnavailable(shown, now);
  const { when, time, clock } = useMatchTimes(shown);
  const panel = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<DrawerTab>("match");
  /** La partita aperta non è arrivata entro 20 secondi: il tab lo dice e offre "Try again". */
  const [timedOut, setTimedOut] = useState(false);

  const requestPast = (row: ScheduleMatch) => {
    setTab("match");
    onOpen(row);
    void openPast({ conversationId, eventId: row.eventId }).catch((e) => console.error(e));
  };

  useEffect(() => {
    setTimedOut(false);
    if (!opened) return;
    const id = setTimeout(() => setTimedOut(true), DETAILS_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [opened?.match.eventId, opened?.requestedAt]);

  const pastFailed = !!opened && !details && timedOut;
  const pastLoading = !!opened && !details && !pastFailed;

  const pitch = details ? pitchView(details.lineups) : null;
  const hasLineups = !!details && details.lineups.length > 0;
  const hasBench = !!details && details.lineups.some((lineup) => lineup.bench.length > 0);
  const hasData = !!details && (hasLineups || details.events.length > 0 || details.stats.length > 0);
  const staleDetails = !!details && isStale(details.fetchedAt, now);
  const matches = schedule ? matchesTab(schedule) : null;
  const hasMatches = !!matches && (matches.next.length > 0 || matches.recent.length > 0);
  const matchesLoading = schedule === undefined || (schedule !== null && schedule.pending);
  const matchDate = (ts: number) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short" });

  // Esc chiude solo con il focus dentro il drawer: nel campo del messaggio, in una modifica o in un selettore no.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onClose();
  };

  // Un clic su un punto non interattivo porta il focus nel drawer, così Esc funziona subito dopo.
  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("button, a, input, textarea, select, [tabindex], [contenteditable='true']")) return;
    panel.current?.focus();
  };

  // Tempi supplementari e rigori scritti per esteso.
  let ending: string | null = null;
  if (state.kind === "finished" && state.ending === "aet") ending = t("teamPins.afterExtraTime");
  if (state.kind === "finished" && state.ending === "pens" && state.shootout && state.winner) {
    const [won, lost] = state.winner === "home" ? [state.shootout.home, state.shootout.away] : [state.shootout.away, state.shootout.home];
    ending = t("teamPins.winOnPens", { team: shown[state.winner].name, score: `${won}–${lost}` });
  }

  return (
    <aside
      ref={panel}
      role="dialog"
      aria-label={t("teamPins.details")}
      data-testid="match-drawer"
      data-details={details === undefined ? "loading" : details ? "loaded" : "none"}
      data-layout={layout}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      style={layout === "beside" ? { width: DRAWER_WIDTH } : undefined}
      className={cn(
        "z-40 flex min-h-0 flex-col bg-app-panel outline-none",
        layout === "beside"
          ? "h-full shrink-0 border-l border-app-border-strong"
          : "absolute inset-0",
      )}
    >
      <header className="relative shrink-0 px-5 pt-4 pb-4">
        <button
          type="button"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
          className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-lg text-app-text-muted hover:bg-app-field hover:text-app-text"
        >
          <X className="size-4" />
        </button>
        {(details?.competition || details?.venue) && (
          <p className="pr-8 text-xs text-app-text-muted">{[details.competition, details.venue].filter(Boolean).join(" · ")}</p>
        )}
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamHead side={shown.home} />
          <div className={cn("flex flex-col items-center", stale && "opacity-50")}>
            <span className="text-2xl font-black text-app-text-strong tabular-nums">
              {"score" in state ? `${state.score.home}–${state.score.away}` : "–"}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-app-text-muted">
              <StatusDot state={state} stale={stale} />
              {opened ? (
                <span className="tabular-nums" data-testid="opened-match-state">
                  {t("teamPins.ft")} · {matchDate(shown.kickoff)}
                </span>
              ) : (
                <StateLabel state={state} when={when} time={time} />
              )}
            </span>
          </div>
          <TeamHead side={shown.away} />
        </div>
        {ending && <p className="mt-2 text-center text-xs font-semibold text-app-text">{ending}</p>}
        {stale && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-app-text-muted">
            <AlertTriangle className="size-3.5 text-amber-500" /> {t("teamPins.unavailable", { time: clock(shown.fetchedAt) })}
          </p>
        )}
      </header>

      <div role="tablist" aria-label={t("teamPins.details")} className="flex shrink-0 gap-5 border-b border-app-border px-5">
        {TABS.map(({ kind, testId, label }) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={tab === kind}
            data-testid={testId}
            onClick={() => setTab(kind)}
            className={cn(
              "border-b-2 px-0.5 py-2.5 text-[13px] font-semibold",
              tab === kind ? "border-app-accent text-app-text-strong" : "border-transparent text-app-text-muted hover:text-app-text",
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {tab === "match" ? (
        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          data-testid="match-tab"
          data-state={
            pastFailed
              ? "failed"
              : pastLoading || details === undefined
                ? "loading"
                : hasData
                  ? "ready"
                  : "empty"
          }
        >
          {opened && (
            <button
              type="button"
              data-testid="back-to-match"
              onClick={onBack}
              className="mb-4 text-[13px] font-semibold text-app-accent hover:underline"
            >
              {t("teamPins.backTo", { match: matchTitle(match) })}
            </button>
          )}
          {pastFailed ? (
            <div className="py-10 text-center" data-testid="match-tab-failed">
              <p className="text-[13px] text-app-text-muted">{t("teamPins.matchLoadFailed")}</p>
              <button
                type="button"
                data-testid="match-tab-retry"
                onClick={() => opened && requestPast(opened.match)}
                className="mt-3 rounded-lg border border-app-border-strong px-3 py-1.5 text-[13px] font-semibold text-app-text-strong hover:bg-app-field"
              >
                {t("teamPins.tryAgain")}
              </button>
            </div>
          ) : pastLoading ? (
            <Loading />
          ) : details === undefined ? (
            <Loading />
          ) : details === null ? (
            <p className="py-10 text-center text-[13px] text-app-text-muted" data-testid="match-tab-empty">
              {t("teamPins.lineupsPending")}
            </p>
          ) : (
            <div className="space-y-5">
              {staleDetails && (
                <p className="flex items-center gap-1.5 text-xs text-app-text-muted">
                  <AlertTriangle className="size-3.5 text-amber-500" /> {t("teamPins.lastUpdated", { time: clock(details.fetchedAt) })}
                </p>
              )}

              {!hasData && (
                <p className="py-10 text-center text-[13px] text-app-text-muted" data-testid="match-tab-empty">
                  {t("teamPins.lineupsPending")}
                </p>
              )}

              {hasLineups && (
                <Section title={t("teamPins.lineups")}>
                  {pitch ? <Pitch view={pitch} events={details.events} match={shown} /> : <PlainLineups details={details} match={shown} />}
                </Section>
              )}

              {hasBench && (
                <Section title={t("teamPins.bench")}>
                  <Bench details={details} match={shown} />
                </Section>
              )}

              {details.events.length > 0 && (
                <Section title={t("teamPins.events")}>
                  <Timeline details={details} />
                </Section>
              )}

              {details.stats.length > 0 && (
                <Section title={t("teamPins.stats")}>
                  <Stats details={details} />
                </Section>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          data-testid="matches-tab"
          data-state={matchesLoading ? "loading" : hasMatches ? "ready" : "empty"}
        >
          {matchesLoading ? (
            <Loading />
          ) : (
            <MatchesTabBody schedule={schedule} matches={matches} now={now} clock={clock} onOpen={requestPast} />
          )}
        </div>
      )}
    </aside>
  );
}

/** Il tab Partite: le prossime 3 partite e gli ultimi 10 risultati, senza amichevoli, con la sigla della competizione e il badge W/D/L. */
function MatchesTabBody({
  schedule,
  matches,
  now,
  clock,
  onOpen,
}: {
  schedule: TeamSchedule | null;
  matches: MatchesTabView | null;
  now: number;
  clock: (ts: number) => string;
  /** Apre una partita finita nel tab Partita; una in programma non si apre. */
  onOpen: (match: ScheduleMatch) => void;
}) {
  const { t, locale } = useI18n();
  const date = (ts: number) => new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const staleAt = schedule?.fetchedAt != null && isStale(schedule.fetchedAt, now) ? schedule.fetchedAt : null;
  const empty = !matches || (matches.next.length === 0 && matches.recent.length === 0);

  const row = (match: ScheduleMatch) => {
    const outcome = matchOutcome(match);
    const cells = (
      <>
        <span className="w-12 shrink-0 text-app-text-muted tabular-nums">{date(match.kickoff)}</span>
        <span className="w-9 shrink-0 rounded bg-app-field py-0.5 text-center text-[10px] font-bold text-app-text-muted">
          {competitionTag(match.league, match.leagueName)}
        </span>
        <span className="w-3 shrink-0 text-[11px] font-semibold text-app-text-muted">{t(match.home ? "teamPins.home" : "teamPins.away")}</span>
        <span className="min-w-0 flex-1 truncate text-app-text">{match.opponent.shortName}</span>
        <span className="shrink-0 font-bold text-app-text-strong tabular-nums">{rowTail(match, clock(match.kickoff))}</span>
        {outcome && (
          <span
            data-testid={`outcome-${match.eventId}`}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-bold",
              outcome === "win" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
              outcome === "loss" && "bg-red-500/15 text-red-600 dark:text-red-400",
              outcome === "draw" && "bg-app-field text-app-text-muted",
            )}
          >
            {t(OUTCOME_LABELS[outcome])}
          </span>
        )}
      </>
    );
    const classes = "flex items-center gap-2 py-1.5 text-[13px]";
    return (
      <li key={match.eventId} data-testid={`match-row-${match.eventId}`} data-openable={opensMatch(match)} className="border-b border-app-border/60 last:border-0">
        {opensMatch(match) ? (
          <button type="button" onClick={() => onOpen(match)} className={cn(classes, "w-full text-left hover:bg-app-field/40")}>
            {cells}
          </button>
        ) : (
          <div className={classes}>{cells}</div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {staleAt !== null && (
        <p className="flex items-center gap-1.5 text-xs text-app-text-muted" data-testid="matches-tab-stale">
          <AlertTriangle className="size-3.5 text-amber-500" /> {t("teamPins.lastUpdated", { time: clock(staleAt) })}
        </p>
      )}
      {empty ? (
        <p className="py-10 text-center text-[13px] text-app-text-muted" data-testid="matches-tab-empty">
          {t("teamPins.noMatches")}
        </p>
      ) : (
        <>
          {matches.next.length > 0 && (
            <Section title={t("teamPins.next")}>
              <ul data-testid="matches-next">{matches.next.map(row)}</ul>
            </Section>
          )}
          {matches.recent.length > 0 && (
            <Section title={t("teamPins.recent")}>
              <ul data-testid="matches-recent">{matches.recent.map(row)}</ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function TeamHead({ side }: { side: PinMatch["home"] }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Crest logo={side.logo} abbreviation={side.abbreviation} size={40} />
      <span className="w-full truncate text-[13px] font-semibold text-app-text-strong">{side.shortName}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold tracking-wide text-app-text-dim uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** Righe grigie che pulsano mentre i dettagli arrivano. */
function Loading() {
  return (
    <div className="space-y-3" data-testid="match-tab-loading">
      {["w-full", "w-5/6", "w-2/3", "w-full", "w-3/4", "w-1/2"].map((width, i) => (
        <div key={i} className={cn("h-3.5 animate-pulse rounded bg-app-field", width)} />
      ))}
    </div>
  );
}

/** Le due squadre sullo stesso campo verticale: la trasferta in alto, la casa in basso. */
function Pitch({ view, events, match }: { view: PitchView; events: Details["events"]; match: PinMatch }) {
  return (
    <div className="relative overflow-hidden rounded-lg" style={{ background: "repeating-linear-gradient(0deg, #15803d 0 28px, #166534 28px 56px)" }} data-testid="match-pitch">
      <PitchLines />
      <div className="relative flex flex-col gap-1.5 px-1 py-3">
        <p className="truncate text-center text-[10px] font-bold text-white/80">
          {match.away.name}
          {view.away.formation && ` · ${view.away.formation}`}
        </p>
        {view.away.rows.map((row, i) => (
          <PitchRow key={`away-${i}`} side="away" row={row} events={events} color={view.away.color} />
        ))}
        <div className="h-2" />
        {[...view.home.rows].reverse().map((row, i) => (
          <PitchRow key={`home-${i}`} side="home" row={row} events={events} color={view.home.color} />
        ))}
        <p className="truncate text-center text-[10px] font-bold text-white/80">
          {match.home.name}
          {view.home.formation && ` · ${view.home.formation}`}
        </p>
      </div>
    </div>
  );
}

/** Le linee bianche del campo, uguali nei due temi. */
function PitchLines() {
  return (
    <div className="pointer-events-none absolute inset-2 rounded-sm border-2 border-white/45">
      <div className="absolute top-1/2 right-0 left-0 h-0 border-t-2 border-white/45" />
      <div className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/45" />
      <div className="absolute top-0 left-1/2 h-[14%] w-[48%] -translate-x-1/2 border-2 border-t-0 border-white/45" />
      <div className="absolute bottom-0 left-1/2 h-[14%] w-[48%] -translate-x-1/2 border-2 border-b-0 border-white/45" />
    </div>
  );
}

function PitchRow({ side, row, events, color }: { side: SideKey; row: PitchMarker[]; events: Details["events"]; color?: string }) {
  return (
    <div className="flex justify-around gap-0.5">
      {row.map((player) => (
        <PlayerMarker
          key={player.athleteId ?? `${player.jersey ?? ""}:${player.shortName}`}
          side={side}
          player={player}
          marks={playerMarks(events, side, player.athleteId)}
          color={color}
        />
      ))}
    </div>
  );
}

function PlayerMarker({
  side,
  player,
  marks,
  color,
}: {
  side: SideKey;
  player: PitchMarker;
  marks: PlayerMarks;
  color?: string;
}) {
  return (
    <div
      className="flex w-1/5 min-w-0 flex-col items-center"
      data-testid={`pitch-player-${side}-${player.athleteId ?? player.name}`}
    >
      <div className="relative">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-white/50 tabular-nums",
            !color && "bg-black/55 text-white",
          )}
          style={color ? { backgroundColor: `#${color.replace(/^#+/, "")}`, color: readableInk(color) } : undefined}
        >
          {player.jersey}
        </span>
        <span className="absolute -top-2 -right-2 flex items-center gap-0.5" aria-hidden>
          {marks.goals > 0 && <span className="text-[9px] leading-none">{"⚽".repeat(marks.goals)}</span>}
          {marks.yellow && <span className="inline-block h-2 w-1.5 rounded-[1px] bg-yellow-400" />}
          {marks.red && <span className="inline-block h-2 w-1.5 rounded-[1px] bg-red-600" />}
          {marks.off && <span className="rounded bg-black/50 px-0.5 text-[8px] font-bold text-red-400">{`↓ ${marks.off}`}</span>}
        </span>
      </div>
      <span className="mt-0.5 max-w-full truncate rounded bg-black/35 px-1 text-[10px] font-semibold text-white">{player.shortName}</span>
    </div>
  );
}

/** La panchina: due colonne, la casa a sinistra, e chi è entrato in grassetto col minuto e chi ha sostituito. */
function Bench({ details, match }: { details: Details; match: PinMatch }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-4">
      {(["home", "away"] as const).map((side) => {
        const lineup = lineupOf(details, side);
        if (!lineup || lineup.bench.length === 0) return <div key={side} />;
        return (
          <SideColumn key={side} side={side} match={match}>
            <ul className="space-y-0.5">
              {lineup.bench.map((p) => {
                const marks = playerMarks(details.events, side, p.athleteId);
                return (
                  <li key={p.athleteId ?? `${p.jersey ?? ""}:${p.name}`} className="flex items-baseline gap-1.5 text-[13px]" data-testid={`bench-player-${side}-${p.athleteId ?? p.name}`}>
                    <span className="w-5 shrink-0 text-right text-xs text-app-text-muted tabular-nums">{p.jersey}</span>
                    <span className={cn("min-w-0 truncate", marks.on ? "font-semibold text-app-text-strong" : "text-app-text")}>
                      {p.name}
                      {marks.on && (
                        <span className="block text-[11px] font-normal text-app-accent">
                          {t("teamPins.cameOn", { minute: marks.on.minute, name: marks.on.other ?? "" })}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </SideColumn>
        );
      })}
    </div>
  );
}

/** Una formazione senza posti (il riassunto 2015, o una riga salvata prima): due liste e una riga che lo dice. */
function PlainLineups({ details, match }: { details: Details; match: PinMatch }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-4" data-testid="plain-lineups">
      {(["home", "away"] as const).map((side) => {
        const lineup = lineupOf(details, side);
        if (!lineup) return <div key={side} />;
        return (
          <SideColumn key={side} side={side} match={match}>
            {lineup.formation && <p className="mb-1 text-xs text-app-text-muted">{lineup.formation}</p>}
            <PlayerList players={lineup.starters} />
          </SideColumn>
        );
      })}
      <p className="col-span-2 text-xs text-app-text-muted">{t("teamPins.positionsUnavailable")}</p>
    </div>
  );
}

/** La formazione di un lato, o niente. */
function lineupOf(details: Details, side: SideKey) {
  return details.lineups.find((lineup) => lineup.side === side);
}

/** Una delle due colonne sotto il campo, con la sigla della squadra in testa. */
function SideColumn({ side, match, children }: { side: SideKey; match: PinMatch; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-bold text-app-text-strong">{match[side].abbreviation}</p>
      {children}
    </div>
  );
}

function PlayerList({ players }: { players: { name: string; jersey?: string }[] }) {
  return (
    <ul className="space-y-0.5">
      {players.map((p) => (
        <li key={`${p.jersey ?? ""}:${p.name}`} className="flex gap-1.5 truncate text-app-text">
          <span className="w-5 shrink-0 text-right text-xs text-app-text-muted tabular-nums">{p.jersey}</span>
          <span className="truncate">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

/** Gli eventi su una linea centrale: la casa a sinistra, la trasferta a destra. */
function Timeline({ details }: { details: Details }) {
  const { t } = useI18n();
  return (
    <ul className="relative space-y-3" data-testid="match-timeline">
      <span aria-hidden className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-l border-app-border" />
      {details.events.map((e, i) => {
        const content = (
          <div className="min-w-0">
            <p className="font-semibold break-words text-app-text-strong">{e.player}</p>
            {e.kind === "ownGoal" && <span className="text-xs text-app-text-muted">{t("teamPins.ownGoalMark")}</span>}
            {e.kind === "penaltyGoal" && <span className="text-xs text-app-text-muted">{t("teamPins.penaltyMark")}</span>}
            {e.other && (
              <p className="text-xs break-words text-app-text-muted">
                {e.kind === "substitution" ? t("teamPins.replaces", { name: e.other }) : t("teamPins.assist", { name: e.other })}
              </p>
            )}
          </div>
        );
        return (
          <li
            key={`${e.kind}:${e.minute}:${e.side}:${e.playerId ?? e.player ?? ""}:${e.otherId ?? e.other ?? ""}:${i}`}
            className="relative grid grid-cols-[1fr_2.5rem_1fr] items-center gap-2 text-[13px]"
          >
            <div className="col-start-1 text-right">{e.side === "home" && content}</div>
            <div className="col-start-2 flex flex-col items-center bg-app-panel py-0.5">
              <span aria-hidden>{EVENT_ICONS[e.kind]}</span>
              <span className="text-[10px] text-app-text-muted tabular-nums">{e.minute}</span>
            </div>
            <div className="col-start-3 text-left">{e.side === "away" && content}</div>
          </li>
        );
      })}
    </ul>
  );
}

/** Le barre divise: il valore di casa, l'etichetta, il valore della trasferta, poi la barra. */
function Stats({ details }: { details: Details }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-3">
      {details.stats.map((s) => {
        const total = s.home + s.away;
        const homeShare = total === 0 ? 50 : (s.home / total) * 100;
        const unit = s.key === "possession" ? "%" : "";
        return (
          <li key={s.key} data-testid={`stat-${s.key}`}>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-bold text-app-text-strong tabular-nums">
                {s.home}
                {unit}
              </span>
              <span className="text-xs text-app-text-muted">{t(STAT_LABELS[s.key])}</span>
              <span className="font-bold text-app-text-strong tabular-nums">
                {s.away}
                {unit}
              </span>
            </div>
            <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              <span className="rounded-l-full bg-app-accent" style={{ width: `${homeShare}%` }} />
              <span className="flex-1 rounded-r-full bg-app-text-dim/50" />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

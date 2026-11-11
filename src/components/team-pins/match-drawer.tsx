import { useRef } from "react";
import { useQuery } from "convex/react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Crest } from "@/components/team-pins/crest";
import { StateLabel, StatusDot, useMatchTimes } from "@/components/team-pins/match-label";
import type { MessageKey } from "@/i18n/en";
import { useI18n } from "@/i18n/i18n-provider";
import { chipState, isUnavailable, type PinMatch } from "@/lib/match-chip";
import { DRAWER_WIDTH, type DrawerLayout } from "@/lib/match-drawer";
import { cn } from "@/lib/utils";

type Details = Doc<"footballMatchDetails">;

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

/**
 * Il drawer di una partita: intestazione, poi Eventi, Formazioni e Statistiche. Una sezione senza dati non compare,
 * quindi prima delle formazioni c'è solo l'intestazione. Sta di fianco alla chat, che si restringe, oppure la copre
 * quando è troppo stretta (docs/MATCH-DRAWER-SPEC.md, Layout and closing). Si chiude con la X, con un secondo clic
 * sul suo chip o con Esc mentre il focus è dentro: un clic fuori no, e nemmeno Esc nel campo del messaggio.
 */
export function MatchDrawer({
  conversationId,
  match,
  now,
  layout,
  onClose,
}: {
  conversationId: Id<"conversations">;
  match: PinMatch;
  now: number;
  layout: DrawerLayout;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const details = useQuery(api.footballMatches.details, { conversationId, eventId: match.eventId });
  const state = chipState(match);
  const stale = isUnavailable(match, now);
  const { when, time, clock } = useMatchTimes(match);
  const panel = useRef<HTMLElement>(null);

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
    ending = t("teamPins.winOnPens", { team: match[state.winner].name, score: `${won}–${lost}` });
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
      <header className="relative shrink-0 border-b border-app-border px-5 pt-4 pb-4">
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
          <TeamHead side={match.home} />
          <div className={cn("flex flex-col items-center", stale && "opacity-50")}>
            <span className="text-2xl font-black text-app-text-strong tabular-nums">
              {"score" in state ? `${state.score.home}–${state.score.away}` : "–"}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-app-text-muted">
              <StatusDot state={state} stale={stale} />
              <StateLabel state={state} when={when} time={time} />
            </span>
          </div>
          <TeamHead side={match.away} />
        </div>
        {ending && <p className="mt-2 text-center text-xs font-semibold text-app-text">{ending}</p>}
        {stale && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-app-text-muted">
            <AlertTriangle className="size-3.5 text-amber-500" /> {t("teamPins.unavailable", { time: clock(match.fetchedAt) })}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {details && details.events.length > 0 && (
          <Section title={t("teamPins.events")}>
            <ul className="space-y-1.5">
              {details.events.map((e) => (
                <li key={`${e.kind}:${e.minute}:${e.side}:${e.player ?? ""}:${e.other ?? ""}`} className={cn("flex items-baseline gap-2 text-[13px]", e.side === "away" && "flex-row-reverse text-right")}>
                  <span className="w-9 shrink-0 text-xs text-app-text-muted tabular-nums">{e.minute}</span>
                  <span aria-hidden>{EVENT_ICONS[e.kind]}</span>
                  <span className="min-w-0">
                    <span className="font-semibold text-app-text-strong">{e.player}</span>
                    {e.kind === "ownGoal" && <span className="text-app-text-muted"> {t("teamPins.ownGoalMark")}</span>}
                    {e.kind === "penaltyGoal" && <span className="text-app-text-muted"> {t("teamPins.penaltyMark")}</span>}
                    {e.other && (
                      <span className="block text-xs text-app-text-muted">
                        {e.kind === "substitution" ? t("teamPins.replaces", { name: e.other }) : t("teamPins.assist", { name: e.other })}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {details && details.lineups.length > 0 && (
          <Section title={t("teamPins.lineups")}>
            <div className="grid grid-cols-2 gap-4">
              {(["home", "away"] as const).map((sideKey) => {
                const lineup = details.lineups.find((l) => l.side === sideKey);
                if (!lineup) return <div key={sideKey} />;
                return (
                  <div key={sideKey} className="min-w-0 text-[13px]">
                    <p className="mb-1 font-bold text-app-text-strong">
                      {match[sideKey].abbreviation}
                      {lineup.formation && <span className="ml-1.5 font-normal text-app-text-muted">{lineup.formation}</span>}
                    </p>
                    <PlayerList players={lineup.starters} />
                    {lineup.bench.length > 0 && (
                      <>
                        <p className="mt-2 mb-1 text-xs font-bold tracking-wide text-app-text-dim uppercase">{t("teamPins.bench")}</p>
                        <PlayerList players={lineup.bench} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {details && details.stats.length > 0 && (
          <Section title={t("teamPins.stats")}>
            <ul className="space-y-3">
              {details.stats.map((s) => {
                const total = s.home + s.away;
                const homeShare = total === 0 ? 50 : (s.home / total) * 100;
                const unit = s.key === "possession" ? "%" : "";
                return (
                  <li key={s.key} data-testid={`stat-${s.key}`}>
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="font-bold text-app-text-strong tabular-nums">{s.home}{unit}</span>
                      <span className="text-xs text-app-text-muted">{t(STAT_LABELS[s.key])}</span>
                      <span className="font-bold text-app-text-strong tabular-nums">{s.away}{unit}</span>
                    </div>
                    <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                      <span className="rounded-l-full bg-app-accent" style={{ width: `${homeShare}%` }} />
                      <span className="flex-1 rounded-r-full bg-app-text-dim/50" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </div>
    </aside>
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

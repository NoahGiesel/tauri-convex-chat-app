import { useEffect } from "react";
import { useQuery } from "convex/react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Crest } from "@/components/team-pins/crest";
import { LIVE_KINDS, LiveDot, StateLabel } from "@/components/team-pins/match-label";
import type { MessageKey } from "@/i18n/en";
import { useI18n } from "@/i18n/i18n-provider";
import { chipState, isUnavailable, type PinMatch } from "@/lib/match-chip";
import { cn } from "@/lib/utils";

const STAT_LABELS: Record<string, MessageKey> = {
  possession: "teamPins.possession",
  shots: "teamPins.shots",
  shotsOnTarget: "teamPins.shotsOnTarget",
  corners: "teamPins.corners",
  fouls: "teamPins.fouls",
  offsides: "teamPins.offsides",
};

const EVENT_ICONS: Record<string, string> = {
  goal: "⚽",
  penaltyGoal: "⚽",
  ownGoal: "⚽",
  yellowCard: "🟨",
  redCard: "🟥",
  substitution: "🔁",
};

/**
 * Il drawer di una partita, a destra sopra la chat (che non si sposta): intestazione, poi Eventi, Formazioni
 * e Statistiche. Una sezione senza dati non compare, quindi prima delle formazioni c'è solo l'intestazione.
 * Si chiude con la X, con Esc o con un clic fuori.
 */
export function MatchDrawer({ match, now, onClose }: { match: PinMatch; now: number; onClose: () => void }) {
  const { t, locale } = useI18n();
  const details = useQuery(api.footballMatches.details, { eventId: match.eventId });
  const state = chipState(match);
  const stale = isUnavailable(match, now);
  const time = (ts: number) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const when = new Date(match.kickoff).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tempi supplementari e rigori scritti per esteso.
  let ending: string | null = null;
  if (state.kind === "finished" && state.ending === "aet") ending = t("teamPins.afterExtraTime");
  if (state.kind === "finished" && state.ending === "pens" && state.shootout && state.winner) {
    const [won, lost] = state.winner === "home" ? [state.shootout.home, state.shootout.away] : [state.shootout.away, state.shootout.home];
    ending = t("teamPins.winOnPens", { team: match[state.winner].name, score: `${won}–${lost}` });
  }

  return (
    <div className="fixed inset-0 z-40" onPointerDown={onClose}>
      <aside
        role="dialog"
        aria-label={t("teamPins.details")}
        data-testid="match-drawer"
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 flex h-full w-[380px] max-w-full flex-col border-l border-app-border-strong bg-app-panel shadow-2xl"
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
                {LIVE_KINDS.includes(state.kind) && <LiveDot still={stale} />}
                <StateLabel state={state} when={when} time={time(match.kickoff)} />
              </span>
            </div>
            <TeamHead side={match.away} />
          </div>
          {ending && <p className="mt-2 text-center text-xs font-semibold text-app-text">{ending}</p>}
          {stale && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-app-text-muted">
              <AlertTriangle className="size-3.5 text-amber-500" /> {t("teamPins.unavailable", { time: time(match.fetchedAt) })}
            </p>
          )}
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {details && details.events.length > 0 && (
            <Section title={t("teamPins.events")}>
              <ul className="space-y-1.5">
                {details.events.map((e, i) => (
                  <li key={i} className={cn("flex items-baseline gap-2 text-[13px]", e.side === "away" && "flex-row-reverse text-right")}>
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

function PlayerList({ players }: { players: { name: string; jersey?: string }[] }) {
  return (
    <ul className="space-y-0.5">
      {players.map((p, i) => (
        <li key={i} className="flex gap-1.5 truncate text-app-text">
          <span className="w-5 shrink-0 text-right text-xs text-app-text-muted tabular-nums">{p.jersey}</span>
          <span className="truncate">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

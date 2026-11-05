import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { outlineButtonClass, primaryButtonClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { openRunWindow } from "@/lib/popout";
import { WORDLE_LANGUAGE_NAME, formatHoursMinutes, formatMinutesSeconds } from "@/lib/wordle";
import type { MessageKey } from "@/i18n/en";
import { MAX_GUESSES, type OutcomeReason } from "../../../convex/wordleRules";
import { Grid } from "./grid";
import { Tile } from "./tile";

type Card = NonNullable<FunctionReturnType<typeof api.wordleDuels.get>>;
type Side = Card["mySide"] & string;

const nameOf = (duel: Card, side: Side) => (side === "a" ? duel.nameA : duel.nameB);

const PLAYER_STATE: Record<Card["players"]["a"], MessageKey> = {
  toPlay: "wordle.toPlay",
  playing: "wordle.playing",
  finished: "wordle.finished",
};

/** Perché ha vinto, sotto "🏆 Nome vince". */
const WIN_REASON: Record<Exclude<OutcomeReason, "neitherGuessed">, MessageKey> = {
  fewerGuesses: "wordle.reason.fewerGuesses",
  fasterRun: "wordle.reason.fasterRun",
  onlyOneGuessed: "wordle.reason.onlyOneGuessed",
  forfeit: "wordle.reason.forfeit",
};

/** Ogni quanto si aggiorna la scheda: ogni secondo mentre la tua Run è in corso, altrimenti bastano ore e minuti. */
const TICK_MS = 30_000;
const RUN_TICK_MS = 1_000;

/** Il Wordle Duel nella chat: invito, risposta e stati finali. */
export function WordleDuelCard({ duelId, onLayout }: { duelId: Id<"wordleDuels">; onLayout?: () => void }) {
  const { t } = useI18n();
  const duel = useQuery(api.wordleDuels.get, { duelId });
  const respond = useMutation(api.wordleDuels.respond);
  const start = useMutation(api.wordleDuels.start);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const playing = duel?.status === "open" && duel.myRun?.state === "playing";
  const tick = playing ? RUN_TICK_MS : duel?.status === "invite" || duel?.status === "open" ? TICK_MS : null;
  useEffect(() => {
    if (tick === null) return;
    const id = setInterval(() => setNow(Date.now()), tick);
    return () => clearInterval(id);
  }, [tick]);

  // Differenza dall'ora del server, perché il tempo che resta sia quello del server.
  const offset = useRef(0);
  useEffect(() => {
    if (duel) offset.current = duel.serverNow - Date.now();
  }, [duel]);

  const layoutKey = `${duel?.status ?? ""}-${duel?.players.a ?? ""}-${duel?.players.b ?? ""}`;
  useEffect(() => {
    onLayout?.();
  }, [layoutKey, onLayout]);

  if (!duel) return null;
  const serverNow = now + offset.current;
  // Dopo la Duel deadline una Run non si apre più: il Duel aspetta solo la Run ancora in corso.
  const pastDeadline = duel.deadline !== null && serverNow >= duel.deadline;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }
  const answer = (action: "accept" | "decline" | "withdraw") => void run(() => respond({ duelId, action }));
  const openRun = () => void openRunWindow(duelId, t("wordle.title"));
  // La rivincita è un invito normale con le stesse impostazioni, senza il popover di /wordle.
  const rematch = () =>
    void run(() => start({ conversationId: duel.conversationId, runMinutes: duel.runMinutes, language: duel.language }));

  return (
    <div
      data-testid="wordle-duel-card"
      data-wordle-duel={duelId}
      className="mt-1.5 flex w-[min(420px,100%)] flex-col gap-3 rounded-[calc(14px*var(--radius-scale))] border-2 border-app-border-strong bg-app-field/50 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-extrabold text-app-text-strong">
          <span className="flex gap-[2px]" aria-hidden>
            <Tile size="sm" kind="correct" />
            <Tile size="sm" kind="present" />
            <Tile size="sm" kind="absent" />
          </span>
          {t("wordle.title")}
        </div>
        <div className="flex gap-1">
          <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">⏱ {t("wordle.minutes", { n: duel.runMinutes })}</span>
          <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">{WORDLE_LANGUAGE_NAME[duel.language]}</span>
        </div>
      </div>

      {duel.status === "invite" && (
        <>
          <p className="text-sm font-semibold text-app-text">
            {duel.mySide === "b" ? t("wordle.challenge", { name: duel.nameA }) : t("wordle.challengeSent", { name: duel.nameB })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {duel.mySide === "b" && (
              <>
                <button type="button" onClick={() => answer("accept")} className={cn(primaryButtonClass, "h-9 px-4 text-sm")}>
                  {t("game.accept")}
                </button>
                <button type="button" onClick={() => answer("decline")} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
                  {t("game.decline")}
                </button>
              </>
            )}
            {duel.mySide === "a" && (
              <button type="button" onClick={() => answer("withdraw")} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
                {t("wordle.withdraw")}
              </button>
            )}
            <span className="ml-auto text-xs text-app-text-dim">{t("wordle.expiresIn", { time: formatHoursMinutes(duel.expiresAt - serverNow, t) })}</span>
          </div>
        </>
      )}

      {duel.status === "open" && (
        <div className="grid grid-cols-2 gap-2">
          {(["a", "b"] as const).map((side) => (
            <div key={side} className="flex flex-col items-center gap-0.5 rounded-xl border border-app-border bg-app-bg px-2 py-2">
              <span className="max-w-full truncate text-sm font-bold text-app-text-strong">{nameOf(duel, side)}</span>
              <span className={cn("text-xs", duel.players[side] === "finished" ? "font-semibold text-app-online" : "text-app-text-muted")}>
                {t(PLAYER_STATE[duel.players[side]])}
              </span>
            </div>
          ))}
        </div>
      )}

      {duel.status === "open" && duel.myRun && (
        <div className="flex flex-col items-center gap-1.5">
          {duel.myRun.state === "toPlay" && !pastDeadline && (
            <>
              <button type="button" onClick={openRun} className={cn(primaryButtonClass, "h-10 px-5 text-sm")}>
                {t("wordle.startRun", { n: duel.runMinutes })}
              </button>
              <span className="text-center text-[11px] text-app-text-dim">{t("wordle.startRunNote")}</span>
            </>
          )}
          {duel.myRun.state === "playing" && duel.myRun.endsAt !== null && (
            <button type="button" onClick={openRun} className={cn(primaryButtonClass, "h-10 px-5 text-sm")}>
              {t("wordle.backToRun", { time: formatMinutesSeconds(duel.myRun.endsAt - serverNow) })}
            </button>
          )}
          {duel.myRun.state === "finished" && (
            <button type="button" onClick={openRun} className={cn(outlineButtonClass, "h-8 px-3 text-xs")}>
              {t("wordle.seeRun")}
            </button>
          )}
        </div>
      )}
      {duel.status === "open" && duel.deadline !== null && (
        <p className="text-center text-[11px] text-app-text-dim">
          {pastDeadline ? t("wordle.closesAfterRun") : t("wordle.hiddenUntilBoth", { time: formatHoursMinutes(duel.deadline - serverNow, t) })}
        </p>
      )}

      {duel.status === "closed" && duel.result && <ClosedResult duel={duel} result={duel.result} />}
      {duel.canRematch && (
        <button type="button" onClick={rematch} className={cn(outlineButtonClass, "h-9 self-center px-4 text-sm")}>
          {t("game.rematch")}
        </button>
      )}

      {duel.status === "declined" && <p className="text-sm text-app-text-muted">{t("wordle.declined", { name: duel.nameB })}</p>}
      {duel.status === "withdrawn" && <p className="text-sm text-app-text-muted">{t("wordle.withdrawn", { name: duel.nameA })}</p>}
      {duel.status === "expired" && (
        <p className="text-sm text-app-text-muted">{t(duel.acceptedAt === null ? "wordle.inviteExpired" : "wordle.duelExpired")}</p>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** La scheda chiusa: la parola, una colonna per giocatore e chi ha vinto. */
function ClosedResult({ duel, result }: { duel: Card; result: NonNullable<Card["result"]> }) {
  const { t } = useI18n();
  const winner = result.outcome?.winner ?? null;
  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-semibold text-app-text-muted">{t("wordle.wordWas")}</span>
        <div className="flex gap-1" aria-label={result.word.toUpperCase()}>
          {[...result.word].map((letter, i) => (
            <Tile key={i} size="md" letter={letter} kind="correct" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["a", "b"] as const).map((side) => {
          const run = result.runs[side];
          return (
            <div
              key={side}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border-2 bg-app-bg px-2 py-2",
                winner === side ? "border-app-accent" : "border-app-border",
              )}
            >
              <span className="max-w-full truncate text-sm font-bold text-app-text-strong">{nameOf(duel, side)}</span>
              {run ? (
                <>
                  <Grid guesses={run.guesses} size="sm" />
                  <span className="text-xs font-bold text-app-text-strong tabular-nums">
                    {run.endReason === "solved" ? run.guesses.length : "X"}/{MAX_GUESSES} · {formatMinutesSeconds(run.timeMs)}
                  </span>
                  {(run.endReason === "timeout" || run.endReason === "gaveUp") && (
                    <span className="text-[11px] text-app-text-dim">{t(run.endReason === "timeout" ? "wordle.timeOutNote" : "wordle.gaveUpNote")}</span>
                  )}
                </>
              ) : (
                <span className="py-4 text-center text-xs text-app-text-muted">{t("wordle.didNotFinish")}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-sm font-bold text-app-text-strong">
        {result.outcome && winner !== null && result.outcome.reason !== "neitherGuessed" ? (
          <>
            {t("wordle.wins", { name: nameOf(duel, winner) })}
            <span className="block text-xs font-normal text-app-text-muted">{t(WIN_REASON[result.outcome.reason])}</span>
          </>
        ) : (
          t(result.outcome?.reason === "neitherGuessed" ? "wordle.drawNeither" : "wordle.drawTie")
        )}
      </p>
    </>
  );
}

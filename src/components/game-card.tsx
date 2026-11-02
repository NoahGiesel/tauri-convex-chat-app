import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { primaryButtonClass, outlineButtonClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

export const MOVE_EMOJI = { stone: "🪨", paper: "📄", scissors: "✂️" } as const;
type Move = keyof typeof MOVE_EMOJI;
const MOVES: Move[] = ["stone", "paper", "scissors"];

/** Partita di sasso-carta-forbici nella chat: invito, conto alla rovescia di ogni round, risultato. */
export function GameCard({ gameId, onLayout }: { gameId: Id<"games">; onLayout?: () => void }) {
  const { t } = useI18n();
  const game = useQuery(api.games.get, { gameId });
  const respond = useMutation(api.games.respond);
  const pick = useMutation(api.games.pick);
  const start = useMutation(api.games.start);
  const [error, setError] = useState<string | null>(null);

  // Il conto alla rovescia usa l'ora del server (stima della differenza dall'orologio locale), così i due giocatori vedono lo stesso.
  const offset = useRef(0);
  useEffect(() => {
    if (game) offset.current = game.serverNow - Date.now();
  }, [game]);
  const [now, setNow] = useState(() => Date.now());
  const ticking = game?.status === "playing";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [ticking]);

  const layoutKey = game ? `${game.status}-${game.rounds.length}-${game.endsAt !== null}` : "";
  useEffect(() => {
    onLayout?.();
  }, [layoutKey, onLayout]);

  if (!game) return null;
  const serverNow = now + offset.current;
  const mine = game.mySide;
  const opponentName = mine === "a" ? game.nameB : game.nameA;
  const moveName = (m: Move) => t(`game.${m}`);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  const last = game.rounds[game.rounds.length - 1];
  const winnerName = (w: "a" | "b") => (w === "a" ? game.nameA : game.nameB);

  const countingDown = game.status === "playing" && game.endsAt !== null && serverNow < game.endsAt;
  const waitingReveal = game.status === "playing" && game.endsAt !== null && !countingDown;
  const betweenRounds = game.status === "playing" && game.endsAt === null && last;
  const seconds = game.endsAt !== null ? Math.max(1, Math.ceil((game.endsAt - serverNow) / 1000)) : 0;
  const nextIn = game.nextRoundAt !== null ? Math.max(1, Math.ceil((game.nextRoundAt - serverNow) / 1000)) : 0;

  const roundLine = (r: { a?: Move; b?: Move; winner: "a" | "b" | "draw" }) => (
    <span className="flex items-center gap-2">
      <span className="text-xl">{r.a ? MOVE_EMOJI[r.a] : "—"}</span>
      <span className="text-xs text-app-text-dim">vs</span>
      <span className="text-xl">{r.b ? MOVE_EMOJI[r.b] : "—"}</span>
    </span>
  );

  return (
    <div
      data-testid="game-card"
      className="mt-1.5 flex w-[min(420px,100%)] flex-col gap-3 rounded-[calc(14px*var(--radius-scale))] border-2 border-app-border-strong bg-app-field/50 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-app-text-strong">
          {MOVES.map((m) => MOVE_EMOJI[m]).join(" ")} {t("game.title")}
        </div>
        <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">{t("game.bo3")}</span>
      </div>

      {game.status === "invite" && (
        <>
          <p className="text-sm font-semibold text-app-text">
            {mine === "b" ? t("game.challenge", { name: game.nameA }) : t("game.challengeSent", { name: game.nameB })}
          </p>
          <div className="flex gap-2">
            {mine === "b" ? (
              <>
                <button type="button" onClick={() => void run(() => respond({ gameId, action: "accept" }))} className={cn(primaryButtonClass, "h-9 px-4 text-sm")}>
                  {t("game.accept")}
                </button>
                <button type="button" onClick={() => void run(() => respond({ gameId, action: "decline" }))} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
                  {t("game.decline")}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => void run(() => respond({ gameId, action: "cancel" }))} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
                {t("game.cancel")}
              </button>
            )}
          </div>
        </>
      )}

      {game.status === "declined" && <p className="text-sm text-app-text-muted">{t("game.declined", { name: game.nameB })}</p>}
      {game.status === "cancelled" && <p className="text-sm text-app-text-muted">{t("game.cancelled")}</p>}

      {(game.status === "playing" || game.status === "done") && (
        <div className="flex items-stretch gap-2">
          {(["a", "b"] as const).map((side) => {
            const score = side === "a" ? game.scoreA : game.scoreB;
            const lead = game.status === "done" && game.winnerSide === side;
            return (
              <div
                key={side}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center rounded-xl border px-2 py-2",
                  lead ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-app-bg",
                )}
              >
                <span className="max-w-full truncate text-xs font-semibold text-app-text-muted">
                  {side === game.mySide ? `${side === "a" ? game.nameA : game.nameB} (${t("game.you")})` : side === "a" ? game.nameA : game.nameB}
                </span>
                <span className="text-2xl font-extrabold text-app-text-strong">{score}</span>
              </div>
            );
          })}
        </div>
      )}

      {countingDown && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-xs font-bold tracking-wide text-app-text-muted uppercase">{t("game.round", { n: game.rounds.length + 1 })}</div>
          <div key={seconds} className="text-5xl leading-none font-extrabold text-app-accent-text tabular-nums">
            {seconds}
          </div>
          <div className="text-sm font-semibold text-app-text">
            {game.myPick ? t("game.lockedIn", { name: opponentName }) : t("game.pickNow")}
          </div>
          {mine && (
            <div className="flex gap-2">
              {MOVES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={game.myPick === m}
                  onClick={() => void run(() => pick({ gameId, move: m }))}
                  className={cn(
                    "flex w-[84px] flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors",
                    game.myPick === m
                      ? "border-app-accent bg-app-accent-soft text-app-text-strong"
                      : "border-app-border bg-app-bg text-app-text hover:bg-app-field",
                  )}
                >
                  <span className="text-3xl leading-none">{MOVE_EMOJI[m]}</span>
                  {moveName(m)}
                </button>
              ))}
            </div>
          )}
          {game.opponentPicked && !game.myPick && <div className="text-xs text-app-text-dim">{t("game.opponentReady", { name: opponentName })}</div>}
        </div>
      )}

      {waitingReveal && <p className="text-center text-sm font-semibold text-app-text-muted">{t("game.revealing")}</p>}

      {(betweenRounds || game.status === "done") && last && (
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-4 text-4xl">
            <span>{last.a ? MOVE_EMOJI[last.a] : "—"}</span>
            <span className="text-sm font-bold text-app-text-dim">vs</span>
            <span>{last.b ? MOVE_EMOJI[last.b] : "—"}</span>
          </div>
          <div className="text-sm font-bold text-app-text-strong">
            {last.winner === "draw" ? t("game.roundDraw") : t("game.roundWon", { name: winnerName(last.winner) })}
          </div>
          {betweenRounds && <div className="text-xs text-app-text-dim">{t("game.nextIn", { n: nextIn })}</div>}
        </div>
      )}

      {game.status === "done" && (
        <div className="flex flex-col items-center gap-2 border-t border-app-border pt-3">
          <div className="text-center text-[15px] font-extrabold text-app-text-strong">
            {game.winnerSide ? t("game.winner", { name: winnerName(game.winnerSide) }) : t("game.tie")}
          </div>
          {game.rounds.length > 1 && <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">{game.rounds.map((r, i) => <span key={i}>{roundLine(r)}</span>)}</div>}
          {mine && (
            <button type="button" onClick={() => void run(() => start({ conversationId: game.conversationId }))} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
              {t("game.rematch")}
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

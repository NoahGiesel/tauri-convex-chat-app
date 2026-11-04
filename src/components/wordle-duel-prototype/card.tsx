// PROTOTYPE, throwaway. The Wordle Duel chat card in every state (wayfinder ticket #75).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { outlineButtonClass, primaryButtonClass } from "@/lib/ui-classes";
import { HOUR, ME, THEM, fmt, fmtHours, runMs, type Duel, type Run } from "./model";
import { Grid, Tile } from "./run";

const STATE_LABEL = { toPlay: "To play", playing: "Playing…", finished: "Finished" } as const;
const STATE_DOT = { toPlay: "bg-app-offline", playing: "bg-app-upload animate-pulse", finished: "bg-app-online" } as const;

export function DuelCard({
  duel,
  now,
  onAccept,
  onDecline,
  onWithdraw,
  onOpenRun,
  runSlot,
  wide,
}: {
  duel: Duel;
  now: number;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  onOpenRun: () => void;
  /** Variant A puts the Run inside the card. */
  runSlot?: ReactNode;
  wide?: boolean;
}) {
  const challenger = duel.iAmChallenger ? ME : THEM;
  const challenged = duel.iAmChallenger ? THEM : ME;
  const inviteLeft = duel.createdAt + 24 * HOUR - now;
  const deadlineLeft = (duel.acceptedAt ?? now) + 24 * HOUR - now;
  const myLeft = duel.me.startedAt !== undefined ? duel.me.startedAt + duel.timer * 60_000 - now : 0;

  return (
    <div
      className={cn(
        "mt-1.5 flex flex-col gap-3 rounded-[calc(14px*var(--radius-scale))] border-2 border-app-border-strong bg-app-field/50 p-4",
        wide ? "w-[min(460px,100%)]" : "w-[min(420px,100%)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-extrabold text-app-text-strong">
          <span className="flex gap-[2px]">
            <Tile size="sm" kind="g" />
            <Tile size="sm" kind="y" />
            <Tile size="sm" kind="x" />
          </span>
          Wordle Duel
        </div>
        <div className="flex gap-1">
          <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">⏱ {duel.timer} min</span>
          <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">{duel.lang === "it" ? "Italiano" : "English"}</span>
        </div>
      </div>

      {duel.status === "invite" && (
        <>
          <p className="text-sm font-semibold text-app-text">
            {duel.iAmChallenger ? `You challenged ${THEM}. Waiting for an answer.` : `${THEM} challenges you: same word, each in your own Run. Fewer guesses wins.`}
          </p>
          <div className="flex items-center gap-2">
            {duel.iAmChallenger ? (
              <button type="button" onClick={onWithdraw} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
                Withdraw
              </button>
            ) : (
              <>
                <button type="button" onClick={onAccept} className={cn(primaryButtonClass, "h-9 px-4 text-sm")}>
                  Accept
                </button>
                <button type="button" onClick={onDecline} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
                  Decline
                </button>
              </>
            )}
            <span className="ml-auto text-xs text-app-text-dim">Expires in {fmtHours(inviteLeft)}</span>
          </div>
        </>
      )}

      {duel.status === "declined" && <p className="text-sm text-app-text-muted">{challenged} declined the challenge.</p>}
      {duel.status === "withdrawn" && <p className="text-sm text-app-text-muted">{challenger} withdrew the challenge.</p>}
      {duel.status === "inviteExpired" && <p className="text-sm text-app-text-muted">The invite expired: no answer within 24 h.</p>}
      {duel.status === "expired" && <p className="text-sm text-app-text-muted">The Duel expired: neither of you played within 24 h. No winner.</p>}

      {duel.status === "open" && (
        <>
          <div className="flex items-stretch gap-2">
            <PlayerBox name={`${ME} (you)`} run={duel.me} />
            <PlayerBox name={THEM} run={duel.them} />
          </div>
          {runSlot ?? (
            <div className="flex flex-col items-center gap-1.5">
              {duel.me.state === "toPlay" && (
                <>
                  <button type="button" onClick={onOpenRun} className={cn(primaryButtonClass, "h-10 px-5 text-sm")}>
                    Start your Run · {duel.timer} min
                  </button>
                  <span className="text-center text-[11px] text-app-text-dim">The timer starts when you open the Run and never pauses.</span>
                </>
              )}
              {duel.me.state === "playing" && (
                <button type="button" onClick={onOpenRun} className={cn(primaryButtonClass, "h-10 px-5 text-sm")}>
                  Back to your Run · {fmt(myLeft)} left
                </button>
              )}
              {duel.me.state === "finished" && (
                <button type="button" onClick={onOpenRun} className={cn(outlineButtonClass, "h-8 px-3 text-xs")}>
                  See your Run
                </button>
              )}
            </div>
          )}
          <div className="text-center text-xs text-app-text-dim">Results stay hidden until both finish. The Duel closes in {fmtHours(deadlineLeft)}.</div>
        </>
      )}

      {duel.status === "closed" && duel.outcome && <ClosedBody duel={duel} />}
    </div>
  );
}

function PlayerBox({ name, run }: { name: string; run: Run }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl border border-app-border bg-app-bg px-2 py-2">
      <span className="max-w-full truncate text-xs font-semibold text-app-text-muted">{name}</span>
      <span className="flex items-center gap-1.5 text-sm font-bold text-app-text-strong">
        <span className={cn("h-2 w-2 rounded-full", STATE_DOT[run.state])} />
        {STATE_LABEL[run.state]}
      </span>
    </div>
  );
}

function ClosedBody({ duel }: { duel: Duel }) {
  const o = duel.outcome!;
  const winnerName = o.winner === "me" ? ME : o.winner === "them" ? THEM : null;
  const reason = {
    guesses: "fewer guesses",
    faster: "same guesses, faster Run",
    onlyOne: "the only one to guess the word",
    neither: "",
    forfeit: `${o.winner === "me" ? THEM : ME} did not play before the Duel deadline`,
  }[o.reason];
  return (
    <>
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[11px] font-bold tracking-wide text-app-text-dim uppercase">The word was</span>
        <div className="flex gap-1">
          {[...duel.word].map((ch, i) => (
            <Tile key={i} ch={ch} kind="g" />
          ))}
        </div>
      </div>
      <div className="flex items-stretch gap-2">
        <ResultColumn name={`${ME} (you)`} run={duel.me.state === "finished" ? duel.me : undefined} timer={duel.timer} winner={o.winner === "me"} />
        <ResultColumn name={THEM} run={duel.them.state === "finished" ? duel.them : undefined} timer={duel.timer} winner={o.winner === "them"} />
      </div>
      <div className="flex flex-col items-center gap-2 border-t border-app-border pt-3">
        <div className="text-center text-[15px] font-extrabold text-app-text-strong">{winnerName ? `🏆 ${winnerName} wins` : "Draw: neither guessed the word"}</div>
        {reason && <div className="-mt-1 text-xs text-app-text-muted">{reason}</div>}
        <button type="button" className={cn(outlineButtonClass, "h-8 border-dashed px-3 text-xs")} title="Open question: rematch is still in the fog of the map">
          Rematch, same settings? (open question)
        </button>
      </div>
    </>
  );
}

function ResultColumn({ name, run, timer, winner }: { name: string; run?: Run; timer: number; winner: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-2 rounded-xl border px-2 py-2.5", winner ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-app-bg")}>
      <span className="max-w-full truncate text-xs font-semibold text-app-text-muted">{name}</span>
      {run ? (
        <>
          <Grid guesses={run.guesses} size="sm" rows={Math.max(run.guesses.length, 1)} />
          <span className="text-xs font-bold text-app-text-strong">
            {run.solved ? `${run.guesses.length}/6` : "X/6"} · {fmt(runMs(run, timer as 1 | 5 | 10))}
            {run.timedOut ? " (time out)" : run.gaveUp ? " (gave up)" : ""}
          </span>
        </>
      ) : (
        <span className="py-4 text-xs font-semibold text-app-text-dim">Did not finish in time</span>
      )}
    </div>
  );
}

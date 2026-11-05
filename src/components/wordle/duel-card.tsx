import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { outlineButtonClass, primaryButtonClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { openRunWindow } from "@/lib/popout";
import { WORDLE_LANGUAGE_NAME, formatHoursMinutes, formatMinutesSeconds } from "@/lib/wordle";
import { Tile } from "./tile";

/** Ogni quanto si aggiorna la scheda: ogni secondo mentre la tua Run è in corso, altrimenti bastano ore e minuti. */
const TICK_MS = 30_000;
const RUN_TICK_MS = 1_000;

/** Il Wordle Duel nella chat: invito, risposta e stati finali. */
export function WordleDuelCard({ duelId, onLayout }: { duelId: Id<"wordleDuels">; onLayout?: () => void }) {
  const { t } = useI18n();
  const duel = useQuery(api.wordleDuels.get, { duelId });
  const respond = useMutation(api.wordleDuels.respond);
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

  const layoutKey = `${duel?.status ?? ""}-${duel?.myRun?.state ?? ""}`;
  useEffect(() => {
    onLayout?.();
  }, [layoutKey, onLayout]);

  if (!duel) return null;
  const serverNow = now + offset.current;

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

  return (
    <div
      data-testid="wordle-duel-card"
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

      {duel.status === "open" && duel.myRun && (
        <div className="flex flex-col items-center gap-1.5">
          {duel.myRun.state === "toPlay" && (
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
      {duel.status === "declined" && <p className="text-sm text-app-text-muted">{t("wordle.declined", { name: duel.nameB })}</p>}
      {duel.status === "withdrawn" && <p className="text-sm text-app-text-muted">{t("wordle.withdrawn", { name: duel.nameA })}</p>}
      {duel.status === "expired" && duel.acceptedAt === null && <p className="text-sm text-app-text-muted">{t("wordle.inviteExpired")}</p>}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

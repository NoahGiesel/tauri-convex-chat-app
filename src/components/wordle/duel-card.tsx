import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { outlineButtonClass, primaryButtonClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { WORDLE_LANGUAGE_NAME, formatHoursMinutes } from "@/lib/wordle";
import { Tile } from "./tile";

/** Ogni quanto si aggiorna "Scade tra …": la scheda mostra solo ore e minuti. */
const TICK_MS = 30_000;

/** Il Wordle Duel nella chat: invito, risposta e stati finali. */
export function WordleDuelCard({ duelId, onLayout }: { duelId: Id<"wordleDuels">; onLayout?: () => void }) {
  const { t } = useI18n();
  const duel = useQuery(api.wordleDuels.get, { duelId });
  const respond = useMutation(api.wordleDuels.respond);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const inviting = duel?.status === "invite";
  useEffect(() => {
    if (!inviting) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [inviting]);

  const layoutKey = duel?.status ?? "";
  useEffect(() => {
    onLayout?.();
  }, [layoutKey, onLayout]);

  if (!duel) return null;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }
  const answer = (action: "accept" | "decline" | "withdraw") => void run(() => respond({ duelId, action }));

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
            <span className="ml-auto text-xs text-app-text-dim">{t("wordle.expiresIn", { time: formatHoursMinutes(duel.expiresAt - now, t) })}</span>
          </div>
        </>
      )}

      {duel.status === "open" && <p className="text-sm font-semibold text-app-text">{t("wordle.accepted")}</p>}
      {duel.status === "declined" && <p className="text-sm text-app-text-muted">{t("wordle.declined", { name: duel.nameB })}</p>}
      {duel.status === "withdrawn" && <p className="text-sm text-app-text-muted">{t("wordle.withdrawn", { name: duel.nameA })}</p>}
      {duel.status === "expired" && duel.acceptedAt === null && <p className="text-sm text-app-text-muted">{t("wordle.inviteExpired")}</p>}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

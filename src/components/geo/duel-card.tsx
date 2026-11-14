import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { CLUE_NAME, ZONE_NAME, formatKm, formatPoints } from "@/lib/geo";
import { openGeoWindow } from "@/lib/popout";
import { outlineButtonClass, primaryButtonClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { formatHoursMinutes } from "@/lib/wordle";
import type { MessageKey } from "@/i18n/en";
import { placeName, type GeoOutcomeReason } from "../../../convex/geoRules";

type Card = NonNullable<FunctionReturnType<typeof api.geoDuels.get>>;
type Side = Card["mySide"] & string;

const nameOf = (duel: Card, side: Side) => (side === "a" ? duel.nameA : duel.nameB);

const PLAYER_STATE: Record<Card["players"]["a"], MessageKey> = {
  toPlay: "wordle.toPlay",
  playing: "wordle.playing",
  finished: "wordle.finished",
};

/** Perché ha vinto, sotto "🏆 Nome vince". */
const WIN_REASON: Record<GeoOutcomeReason, MessageKey> = {
  morePoints: "geo.reason.morePoints",
  fasterRun: "geo.reason.fasterRun",
  forfeit: "geo.reason.forfeit",
};

/** Ogni quanto si aggiorna la scheda: bastano ore e minuti. */
const TICK_MS = 30_000;

/** Il Geo Duel nella chat: invito, risposta, stato delle Run e risultato. */
export function GeoDuelCard({ duelId, onLayout }: { duelId: Id<"geoDuels">; onLayout?: () => void }) {
  const { t } = useI18n();
  const duel = useQuery(api.geoDuels.get, { duelId });
  const respond = useMutation(api.geoDuels.respond);
  const start = useMutation(api.geoDuels.start);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const ticking = duel?.status === "invite" || duel?.status === "open";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [ticking]);

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
  // Dopo la Duel deadline un Round non si apre più: il Duel aspetta solo il Round ancora in corso.
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
  const openRun = () => void openGeoWindow(duelId, t("geo.title"));
  // La rivincita è un invito normale con le stesse impostazioni, senza il popover di /geo.
  const rematch = () => void run(() => start({ conversationId: duel.conversationId, zone: duel.zone, rounds: duel.rounds, clue: duel.clue }));

  return (
    <div
      data-testid="geo-duel-card"
      data-geo-duel={duelId}
      className="mt-1.5 flex w-[min(420px,100%)] flex-col gap-3 rounded-[calc(14px*var(--radius-scale))] border-2 border-app-border-strong bg-app-field/50 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-extrabold text-app-text-strong">
          <span aria-hidden>🌍</span>
          {t("geo.title")}
        </div>
        <div className="flex gap-1">
          <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">{t(ZONE_NAME[duel.zone])}</span>
          <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">{t("geo.rounds", { n: duel.rounds })}</span>
          <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">{t(CLUE_NAME[duel.clue])}</span>
        </div>
      </div>

      {duel.status === "invite" && (
        <>
          <p className="text-sm font-semibold text-app-text">
            {duel.mySide === "b" ? t("geo.challenge", { name: duel.nameA }) : t("geo.challengeSent", { name: duel.nameB })}
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
                {t("geo.startRun", { n: duel.rounds })}
              </button>
              <span className="text-center text-[11px] text-app-text-dim">{t("geo.startRunNote")}</span>
            </>
          )}
          {duel.myRun.state === "playing" && (
            <button type="button" onClick={openRun} className={cn(primaryButtonClass, "h-10 px-5 text-sm")}>
              {t("geo.backToRun", { n: Math.max(1, duel.myRun.roundsOpened), total: duel.rounds })}
            </button>
          )}
          {duel.myRun.state === "finished" && (
            <button type="button" onClick={openRun} className={cn(outlineButtonClass, "h-8 px-3 text-xs")}>
              {t("geo.seeRun")}
            </button>
          )}
        </div>
      )}
      {duel.status === "open" && duel.deadline !== null && (
        <p className="text-center text-[11px] text-app-text-dim">
          {pastDeadline ? t("geo.closesAfterRound") : t("geo.hiddenUntilBoth", { time: formatHoursMinutes(duel.deadline - serverNow, t) })}
        </p>
      )}

      {duel.status === "closed" && duel.result && <ClosedResult duel={duel} result={duel.result} onOpen={openRun} />}
      {duel.canRematch && (
        <button type="button" onClick={rematch} className={cn(outlineButtonClass, "h-9 self-center px-4 text-sm")}>
          {t("game.rematch")}
        </button>
      )}

      {duel.status === "declined" && <p className="text-sm text-app-text-muted">{t("geo.declined", { name: duel.nameB })}</p>}
      {duel.status === "withdrawn" && <p className="text-sm text-app-text-muted">{t("geo.withdrawn", { name: duel.nameA })}</p>}
      {duel.status === "expired" && (
        <p className="text-sm text-app-text-muted">{t(duel.acceptedAt === null ? "wordle.inviteExpired" : "geo.duelExpired")}</p>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** La scheda chiusa: i totali, una riga per Round con distanza e punti di tutti e due, e chi ha vinto. */
function ClosedResult({ duel, result, onOpen }: { duel: Card; result: NonNullable<Card["result"]>; onOpen: () => void }) {
  const { t, language, locale } = useI18n();
  const winner = result.outcome?.winner ?? null;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {(["a", "b"] as const).map((side) => (
          <div
            key={side}
            className={cn("flex flex-col items-center gap-0.5 rounded-xl border-2 bg-app-bg px-2 py-2", winner === side ? "border-app-accent" : "border-app-border")}
          >
            <span className="max-w-full truncate text-sm font-bold text-app-text-strong">{nameOf(duel, side)}</span>
            {result.totals[side] !== null ? (
              <span className="text-lg font-extrabold tabular-nums text-app-text-strong">{formatPoints(result.totals[side]!, locale)}</span>
            ) : (
              <span className="text-xs text-app-text-muted">{t("geo.didNotPlay")}</span>
            )}
          </div>
        ))}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {result.rounds.map((r, i) => {
            const better = (side: Side) => {
              const mine = r[side]?.points ?? -1;
              const other = r[side === "a" ? "b" : "a"]?.points ?? -1;
              return mine >= 0 && mine >= other;
            };
            return (
              <tr key={i} className="border-t border-app-border first:border-t-0">
                <td className="max-w-[120px] truncate py-1 pr-2 font-semibold text-app-text-strong">{placeName(r.place.names, language)}</td>
                {(["a", "b"] as const).map((side) => (
                  <td key={side} className={cn("py-1 text-right tabular-nums text-app-text-muted", better(side) && "font-bold text-app-text-strong")}>
                    {r[side] ? (
                      <>
                        {r[side]!.km !== null ? formatKm(r[side]!.km!, locale) : t("geo.timeUp")} · {formatPoints(r[side]!.points, locale)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-center text-sm font-bold text-app-text-strong">
        {result.outcome && winner !== null ? (
          <>
            {t("wordle.wins", { name: nameOf(duel, winner) })}
            <span className="block text-xs font-normal text-app-text-muted">{t(WIN_REASON[result.outcome.reason])}</span>
          </>
        ) : (
          t("geo.draw")
        )}
      </p>
      {duel.mySide && (
        <button type="button" onClick={onOpen} className={cn(outlineButtonClass, "h-8 self-center px-3 text-xs")}>
          {t("geo.seeRun")}
        </button>
      )}
    </>
  );
}

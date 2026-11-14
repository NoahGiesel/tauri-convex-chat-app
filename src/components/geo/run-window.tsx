import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Moon, Sun } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { PIN_COLOR, ZONE_NAME, formatKm, formatPoints, getMapTheme, setMapTheme, type MapTheme } from "@/lib/geo";
import { closeThisWindow } from "@/lib/popout";
import { outlineButtonClass, primaryButtonClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { useTheme } from "@/themes/theme-provider";
import { MAX_POINTS, placeName, type LatLng } from "../../../convex/geoRules";
import type { Pin } from "./geo-map";

// MapLibre pesa: lo scarica solo questa finestra.
const GeoMap = lazy(() => import("./geo-map"));

type Data = NonNullable<FunctionReturnType<typeof api.geoDuels.myRun>>;
type RoundView = NonNullable<Data["run"]>["rounds"][number];
type Line = [LatLng, LatLng];

/** Sotto questa soglia il Round timer diventa rosso. */
const LOW_TIME_MS = 10_000;

const panel = "rounded-2xl bg-app-panel/95 shadow-xl ring-1 ring-app-border backdrop-blur";

/** La finestra della Run: la mappa senza nomi a tutto schermo, un Round alla volta, poi il riepilogo. */
export function GeoRunWindow({ duelId: rawId }: { duelId: string }) {
  const duelId = rawId as Id<"geoDuels">;
  const { t, language, locale } = useI18n();
  const { definition } = useTheme();
  const data = useQuery(api.geoDuels.myRun, { duelId });
  const openRound = useMutation(api.geoDuels.openRound);
  const guess = useMutation(api.geoDuels.guess);
  const giveUp = useMutation(api.geoDuels.giveUp);

  const [pin, setPin] = useState<LatLng | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  /** L'ultimo Round di cui il giocatore ha già visto il risultato (con "Prossimo round"). */
  const [reviewed, setReviewed] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** Chiaro o scuro, scelto sulla mappa; finché non si sceglie segue il tema dell'app. */
  const [mapTheme, setMapThemeState] = useState<MapTheme | null>(getMapTheme);

  useEffect(() => {
    document.title = t("geo.title");
  }, [t]);

  // L'ora del server (stima della differenza dall'orologio locale), perché il tempo sia quello del server.
  const offset = useRef(0);
  useEffect(() => {
    if (data) offset.current = data.serverNow - Date.now();
  }, [data]);

  const rounds = data?.run?.rounds ?? [];
  const last = rounds.at(-1);
  const current = last && last.result === null ? last : null;
  const index = rounds.length - 1;

  // Riaprendo la finestra non si rivede il risultato di Round già finiti: si riparte dal prossimo.
  useEffect(() => {
    if (data && reviewed === null) setReviewed(current ? index - 1 : index);
  }, [data, reviewed, current, index]);

  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [current]);

  // Un nuovo Round parte senza segnaposto.
  useEffect(() => setPin(null), [index]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const submit = useCallback(() => {
    if (!pin || !current) return;
    void run(() => guess({ duelId, index, lat: pin.lat, lng: pin.lng }));
  }, [pin, current, run, guess, duelId, index]);

  const left = current ? current.endsAt - (now + offset.current) : 0;
  // A tempo scaduto vale il segnaposto già sulla mappa, se c'è; senza, ci pensa il server (0 punti).
  const sentAtTimeout = useRef(-1);
  useEffect(() => {
    if (current && left <= 0 && pin && sentAtTimeout.current !== index) {
      sentAtTimeout.current = index;
      submit();
    }
  }, [current, left, pin, index, submit]);

  if (data === undefined) return <Centered>{t("common.loading")}</Centered>;
  if (data === null) return <Centered>{t("error.game_closed")}</Centered>;

  const total = rounds.reduce((sum, r) => sum + (r.result?.points ?? 0), 0);
  const runOver = data.run?.endedAt != null;
  const pastDeadline = data.deadline !== null && now + offset.current >= data.deadline;
  const showResult = !current && last && reviewed !== null && reviewed < index;
  const summary = !current && !showResult && (runOver || data.status !== "open");
  const dark = (mapTheme ?? definition.mode) === "dark";
  const toggleMapTheme = () => {
    const next = dark ? "light" : "dark";
    setMapTheme(next);
    setMapThemeState(next);
  };

  // Cosa mostra la mappa: il segnaposto del Round, il risultato di un Round, o tutti i Round alla fine.
  let pins: Pin[] = [];
  let lines: Line[] = [];
  let fit: LatLng[] | undefined;
  if (current) {
    pins = pin ? [{ ...pin, color: PIN_COLOR.me }] : [];
  } else if (showResult && last) {
    ({ pins, lines } = roundMarks(last.place, last.result?.pin ?? null, null));
    fit = pins;
  } else if (summary) {
    const other = data.mySide === "a" ? "b" : "a";
    for (const [i, r] of rounds.entries()) {
      const theirs = data.result?.rounds[i]?.[other]?.pin ?? null;
      const marks = roundMarks(r.place, r.result?.pin ?? null, theirs);
      pins.push(...marks.pins);
      lines.push(...marks.lines);
    }
    fit = pins.length > 0 ? pins : undefined;
  }

  const nextRound = () => {
    setReviewed(index);
    if (!runOver && index + 1 < data.totalRounds) void run(() => openRound({ duelId }));
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-app-bg text-app-text">
      <Suspense fallback={null}>
        <GeoMap zone={data.zone} dark={dark} onPick={current ? setPin : undefined} pins={pins} lines={lines} fit={fit} className="absolute inset-0" />
      </Suspense>

      {/* Mappa chiara o scura, sotto l'angolo in alto a destra. */}
      <button
        type="button"
        onClick={toggleMapTheme}
        aria-label={t(dark ? "geo.mapLight" : "geo.mapDark")}
        title={t(dark ? "geo.mapLight" : "geo.mapDark")}
        className={cn(panel, "absolute right-4 flex size-10 items-center justify-center text-app-text hover:text-app-text-strong", current ? "top-[92px]" : "top-4")}
      >
        {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>

      {/* In alto: punti, il posto da trovare, il tempo. */}
      <div className={cn(panel, "absolute left-4 top-4 px-3 py-2 text-sm")}>
        <div className="text-[11px] text-app-text-muted">{t("geo.score")}</div>
        <div className="font-mono text-lg font-bold tabular-nums">{formatPoints(total, locale)}</div>
      </div>
      {current && (
        <>
          <div className={cn(panel, "absolute left-1/2 top-4 max-w-[60%] -translate-x-1/2 px-6 py-3 text-center")}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-app-text-muted">
              {t("geo.round", { n: index + 1, total: data.totalRounds })} · {t(ZONE_NAME[data.zone])}
            </div>
            <WhereIs name={placeName(current.place.names, language)} />
          </div>
          <div className={cn(panel, "absolute right-4 top-4 px-3 py-2 text-center")}>
            <div className="text-[11px] text-app-text-muted">{t("geo.time")}</div>
            <div className={cn("font-mono text-lg font-bold tabular-nums", left <= LOW_TIME_MS && "text-red-500")}>{formatSeconds(left)}</div>
          </div>
          <button
            type="button"
            data-testid="geo-guess"
            disabled={!pin || busy}
            onClick={submit}
            className={cn(primaryButtonClass, "absolute bottom-8 right-6 h-11 px-6 text-sm shadow-lg")}
          >
            {pin ? t("geo.guess") : t("geo.clickMap")}
          </button>
        </>
      )}

      {/* Prima di un Round: il tempo parte solo con il pulsante. */}
      {!current && !showResult && !summary && (
        <div className="absolute inset-0 flex items-center justify-center bg-app-backdrop/40">
          <div className={cn(panel, "flex w-[min(360px,90%)] flex-col items-center gap-3 p-6 text-center")}>
            <div className="text-xs font-bold uppercase tracking-wider text-app-text-muted">
              {t("geo.title")} · {t(ZONE_NAME[data.zone])}
            </div>
            <div className="text-2xl font-extrabold text-app-text-strong">{t("geo.round", { n: index + 2, total: data.totalRounds })}</div>
            {data.status === "open" && !pastDeadline ? (
              <>
                <button type="button" data-testid="geo-start-round" disabled={busy} onClick={() => void run(() => openRound({ duelId }))} className={cn(primaryButtonClass, "h-11 w-full text-sm")}>
                  {t("geo.startRound", { n: index + 2 })}
                </button>
                <span className="text-xs text-app-text-dim">{t("geo.startRoundNote")}</span>
              </>
            ) : (
              <span className="text-sm text-app-text-muted">{t("error.game_closed")}</span>
            )}
          </div>
        </div>
      )}

      {/* Risultato del Round appena finito. */}
      {showResult && last?.result && (
        <div className={cn(panel, "absolute inset-x-4 bottom-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4")}>
          <div className="min-w-0">
            <div className="truncate text-sm text-app-text-muted">
              {placeName(last.place.names, language)} · {last.place.country}
            </div>
            <div className="text-3xl font-extrabold text-app-text-strong">
              {last.result.km !== null ? formatKm(last.result.km, locale) : t("geo.timeUp")}
            </div>
          </div>
          <div className="min-w-[160px] flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-app-field">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(last.result.points / MAX_POINTS) * 100}%`, background: PIN_COLOR.me }} />
            </div>
            <div className="mt-1 text-sm font-bold">{t("geo.points", { n: formatPoints(last.result.points, locale) })}</div>
          </div>
          <button type="button" data-testid="geo-next" disabled={busy} onClick={nextRound} className={cn(primaryButtonClass, "h-11 px-6 text-sm")}>
            {runOver || index + 1 >= data.totalRounds ? t("geo.seeResult") : t("geo.nextRound")}
          </button>
        </div>
      )}

      {/* Fine della Run: i Round, il totale e, a Duel chiuso, l'altro giocatore. */}
      {summary && <Summary data={data} rounds={rounds} total={total} />}

      {/* Arrendersi: solo a Run aperta e non finita. */}
      {data.status === "open" && data.run && !runOver && !showResult && (
        <div className="absolute bottom-8 left-6 flex items-center gap-2">
          {confirmGiveUp ? (
            <div className={cn(panel, "flex flex-wrap items-center gap-2 px-3 py-2 text-sm")}>
              <span>{t("geo.giveUpConfirm")}</span>
              <button type="button" onClick={() => void run(() => giveUp({ duelId })).then(() => setConfirmGiveUp(false))} className={cn(primaryButtonClass, "h-8 px-3 text-xs")}>
                {t("wordle.giveUpYes")}
              </button>
              <button type="button" onClick={() => setConfirmGiveUp(false)} className={cn(outlineButtonClass, "h-8 px-3 text-xs")}>
                {t("wordle.keepPlaying")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmGiveUp(true)} className={cn(outlineButtonClass, "h-8 bg-app-panel/90 px-3 text-xs")}>
              {t("geo.giveUp")}
            </button>
          )}
        </div>
      )}

      {message && (
        <div role="alert" className="absolute left-1/2 top-28 -translate-x-1/2 rounded-lg bg-destructive px-3 py-1.5 text-sm font-semibold text-white shadow">
          {message}
        </div>
      )}
    </div>
  );
}

/** "Dov'è **Nome**?" nella lingua di chi guarda, con il nome in evidenza. */
function WhereIs({ name }: { name: string }) {
  const { t } = useI18n();
  const MARK = "\u0001";
  const [before, after = ""] = t("geo.whereIs", { name: MARK }).split(MARK);
  return (
    <div className="text-2xl font-extrabold text-app-text-strong" data-testid="geo-where-is">
      {before}
      <span className="text-app-accent-text">{name}</span>
      {after}
    </div>
  );
}

/** Segnaposto e linee di un Round finito: il posto, il mio segnaposto e, se c'è, quello dell'altro. */
function roundMarks(place: RoundView["place"], mine: LatLng | null, theirs: LatLng | null) {
  const pins: Pin[] = [];
  const lines: Line[] = [];
  if (!("lat" in place) || place.lat === undefined || place.lng === undefined) return { pins, lines };
  const truth = { lat: place.lat, lng: place.lng };
  pins.push({ ...truth, color: PIN_COLOR.place });
  if (mine) {
    pins.push({ ...mine, color: PIN_COLOR.me });
    lines.push([mine, truth]);
  }
  if (theirs) {
    pins.push({ ...theirs, color: PIN_COLOR.other });
    lines.push([theirs, truth]);
  }
  return { pins, lines };
}

function Summary({ data, rounds, total }: { data: Data; rounds: RoundView[]; total: number }) {
  const { t, language, locale } = useI18n();
  const result = data.result;
  const me = data.mySide;
  const other = me === "a" ? "b" : "a";
  const winner = result?.outcome?.winner ?? null;
  return (
    <div className={cn(panel, "absolute bottom-4 left-4 top-24 flex w-[min(340px,calc(100%-2rem))] flex-col gap-3 overflow-auto p-5")} data-testid="geo-summary">
      <div className="text-xs font-bold uppercase tracking-wider text-app-text-muted">
        {data.run?.gaveUp ? t("geo.gaveUp") : t("geo.runOver")}
      </div>
      {result ? (
        <div className="text-2xl font-extrabold text-app-text-strong">
          {winner === null ? t("geo.draw") : winner === me ? t("wordle.wins", { name: t("geo.you") }) : t("wordle.wins", { name: data.opponentName })}
        </div>
      ) : (
        <div className="text-2xl font-extrabold text-app-text-strong">{t("geo.points", { n: formatPoints(total, locale) })}</div>
      )}
      {result && (
        <div className="flex gap-4 text-sm font-bold">
          <span style={{ color: PIN_COLOR.me }}>
            {t("geo.you")} {formatPoints(result.totals[me] ?? 0, locale)}
          </span>
          <span style={{ color: PIN_COLOR.other }}>
            {data.opponentName} {result.totals[other] !== null ? formatPoints(result.totals[other]!, locale) : "—"}
          </span>
        </div>
      )}
      <ul className="flex flex-col text-sm">
        {rounds.map((r, i) => {
          const theirs = result?.rounds[i]?.[other] ?? null;
          return (
            <li key={i} className="flex justify-between gap-3 border-t border-app-border py-2">
              <span className="min-w-0 truncate font-semibold">{placeName(r.place.names, language)}</span>
              <span className="shrink-0 text-right tabular-nums text-app-text-muted">
                {r.result?.km != null ? formatKm(r.result.km, locale) : t("geo.timeUp")} · <b className="text-app-text">{formatPoints(r.result?.points ?? 0, locale)}</b>
                {theirs && (
                  <span className="block text-xs" style={{ color: PIN_COLOR.other }}>
                    {theirs.km !== null ? formatKm(theirs.km, locale) : t("geo.timeUp")} · {formatPoints(theirs.points, locale)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
        <li className="flex justify-between border-t-2 border-app-border-strong py-2 font-bold">
          <span>{t("geo.total")}</span>
          <span className="tabular-nums">{formatPoints(total, locale)}</span>
        </li>
      </ul>
      {!result && data.status === "open" && <p className="text-xs text-app-text-muted">{t("geo.waitingOpponent", { name: data.opponentName })}</p>}
      <button type="button" data-testid="geo-close" onClick={closeThisWindow} className={cn(primaryButtonClass, "mt-auto h-10 w-full text-sm")}>
        {t("common.close")}
      </button>
      <p className="text-[11px] text-app-text-dim">{t("geo.mapCredit")}</p>
    </div>
  );
}

function Centered({ children }: { children: string }) {
  return <div className="flex h-screen items-center justify-center bg-app-bg text-sm text-app-text-muted">{children}</div>;
}

/** Secondi che restano in "m:ss", arrotondati per eccesso. */
function formatSeconds(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

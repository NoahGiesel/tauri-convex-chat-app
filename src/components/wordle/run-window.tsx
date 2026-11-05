import { useCallback, useEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { outlineButtonClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { WORDLE_LANGUAGE_NAME, formatClock, formatHoursMinutes } from "@/lib/wordle";
import { MAX_GUESSES, WORD_LENGTH } from "../../../convex/wordleRules";
import { Grid, ITALIAN_HIDDEN, Keyboard } from "./grid";

/** Sotto questa soglia il Run timer diventa rosso. */
const LOW_TIME_MS = 30_000;

const codeOf = (e: unknown) =>
  e instanceof ConvexError && typeof e.data === "object" && e.data !== null && "code" in e.data ? String(e.data.code) : null;

/** La finestra della Run: Run timer, griglia, tastiera, Give up e il riepilogo a fine Run. */
export function WordleRunWindow({ duelId: rawId }: { duelId: string }) {
  const duelId = rawId as Id<"wordleDuels">;
  const { t } = useI18n();
  const data = useQuery(api.wordleDuels.myRun, { duelId });
  const openRun = useMutation(api.wordleDuels.openRun);
  const guess = useMutation(api.wordleDuels.guess);
  const giveUp = useMutation(api.wordleDuels.giveUp);

  const [typed, setTyped] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    document.title = t("wordle.title");
  }, [t]);

  // Aprire la finestra è aprire la Run: da qui parte il Run timer (la mutazione non fa nulla se è già aperta).
  const needsOpening = data?.status === "open" && data.run === null;
  useEffect(() => {
    if (needsOpening) void openRun({ duelId }).catch((e) => setMessage(t(errorKey(e))));
  }, [needsOpening, openRun, duelId, t]);

  // L'ora del server (stima della differenza dall'orologio locale), perché il tempo sia quello del server.
  const offset = useRef(0);
  useEffect(() => {
    if (data) offset.current = data.serverNow - Date.now();
  }, [data]);

  const run = data?.run ?? null;
  const playing = data?.status === "open" && run !== null && !run.endReason;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [playing]);

  const language = data?.language ?? "en";
  const reject = useCallback((text: string) => {
    setMessage(text);
    setShakeKey((k) => k + 1);
  }, []);

  const submit = useCallback(async () => {
    if (typed.length < WORD_LENGTH) return reject(t("wordle.short"));
    setSending(true);
    try {
      await guess({ duelId, word: typed });
      setTyped("");
      setMessage(null);
    } catch (e) {
      const code = codeOf(e);
      if (code === "wordle_not_a_word") reject(t(language === "it" ? "wordle.notInList.it" : "wordle.notInList.en", { word: typed.toUpperCase() }));
      else reject(t(errorKey(e)));
    } finally {
      setSending(false);
    }
  }, [typed, guess, duelId, language, reject, t]);

  const press = useCallback(
    (key: string) => {
      if (!playing || sending) return;
      if (key === "Enter") return void submit();
      if (key === "Backspace") return setTyped((w) => w.slice(0, -1));
      if (!/^[a-z]$/.test(key) || (language === "it" && ITALIAN_HIDDEN.has(key))) return;
      setTyped((w) => (w.length < WORD_LENGTH ? w + key : w));
    },
    [playing, sending, submit, language],
  );

  // La tastiera fisica scrive come quella sullo schermo.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const key = e.key === "Enter" || e.key === "Backspace" ? e.key : e.key.toLowerCase();
      if (key !== "Enter" && key !== "Backspace" && !/^[a-z]$/.test(key)) return;
      e.preventDefault();
      press(key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  if (data === undefined) return <Shell>{null}</Shell>;
  if (data === null) return <Shell><p className="text-sm text-app-text-muted">{t("error.game_closed")}</p></Shell>;

  const serverNow = now + offset.current;
  const left = run ? Math.max(0, run.endsAt - serverNow) : data.runMinutes * 60_000;
  const guesses = run?.guesses ?? [];

  return (
    <Shell>
      <div className="flex w-full items-center justify-between gap-2">
        <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">
          {WORDLE_LANGUAGE_NAME[data.language]} · {guesses.length}/{MAX_GUESSES}
        </span>
        {playing && (
          <span
            role="timer"
            className={cn(
              "rounded-lg px-2.5 py-1 text-lg font-extrabold tabular-nums",
              left < LOW_TIME_MS ? "bg-destructive/15 text-destructive" : "bg-app-accent-soft text-app-accent-text",
            )}
          >
            ⏱ {formatClock(left)}
          </span>
        )}
      </div>
      {playing && <p className="-mt-1 text-center text-[11px] text-app-text-dim">{t("wordle.neverPauses")}</p>}
      {!run && data.status === "open" && <p className="text-sm text-app-text-muted">{t("wordle.starting")}</p>}

      <Grid guesses={guesses} typed={playing ? typed : ""} size="lg" shakeKey={shakeKey} />

      <div role="alert" className="min-h-5 text-center text-xs font-semibold text-destructive">
        {playing ? message : null}
      </div>

      {playing && (
        <>
          <Keyboard language={data.language} guesses={guesses} onKey={press} />
          {confirmGiveUp ? (
            <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-center">
              <span className="text-sm font-semibold text-app-text-strong">{t("wordle.giveUpConfirm")}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void giveUp({ duelId }).catch((e) => setMessage(t(errorKey(e))))}
                  className="h-8 rounded-xl bg-destructive px-3 text-xs font-extrabold text-white hover:opacity-90"
                >
                  {t("wordle.giveUpYes")}
                </button>
                <button type="button" onClick={() => setConfirmGiveUp(false)} className={cn(outlineButtonClass, "h-8 px-3 text-xs")}>
                  {t("wordle.keepPlaying")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmGiveUp(true)}
              className="text-xs font-bold text-app-text-muted underline-offset-2 hover:text-destructive hover:underline"
            >
              🏳 {t("wordle.giveUp")}
            </button>
          )}
        </>
      )}

      {run?.endReason && (
        <div className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-app-border bg-app-bg p-3 text-center">
          <div className="text-[15px] font-extrabold text-app-text-strong">
            {run.endReason === "solved"
              ? t("wordle.endSolved", { n: guesses.length, time: formatClock((run.endedAt ?? run.endsAt) - run.startedAt) })
              : t(run.endReason === "timeout" ? "wordle.endTimeout" : run.endReason === "missed" ? "wordle.endMissed" : "wordle.endGaveUp")}
          </div>
          {data.status === "open" && data.opponentState !== "finished" && (
            <div className="text-sm text-app-text-muted">
              {t("wordle.waitingOpponent", { name: data.opponentName })}
              {data.deadline !== null && ` ${t("wordle.duelClosesIn", { time: formatHoursMinutes(data.deadline - serverNow, t) })}`}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center overflow-y-auto bg-app-panel px-5 py-6 text-app-text">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-3">{children}</div>
    </div>
  );
}

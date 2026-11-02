import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { QUIZ_COUNTDOWN_MS, TOPIC_MAX } from "../../convex/quizRules";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { outlineButtonClass, primaryButtonClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D"];

/** Quiz a due nella chat: argomenti, domanda con conto alla rovescia, risposte rivelate (la giusta in verde), punteggio. */
export function QuizCard({ quizId, onLayout }: { quizId: Id<"quizzes">; onLayout?: () => void }) {
  const { t, language } = useI18n();
  const quiz = useQuery(api.quizzes.get, { quizId });
  const submitTopics = useMutation(api.quizzes.submitTopics);
  const respond = useMutation(api.quizzes.respond);
  const answer = useMutation(api.quizzes.answer);
  const start = useMutation(api.quizzes.start);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [random, setRandom] = useState(false);

  // Ora del server (stima della differenza dall'orologio locale): i due giocatori vedono lo stesso conto alla rovescia.
  const offset = useRef(0);
  useEffect(() => {
    if (quiz) offset.current = quiz.serverNow - Date.now();
  }, [quiz]);
  const [now, setNow] = useState(() => Date.now());
  const ticking = quiz?.status === "playing";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [ticking]);

  const layoutKey = quiz ? `${quiz.status}-${quiz.rounds.length}-${quiz.endsAt !== null}` : "";
  useEffect(() => {
    onLayout?.();
  }, [layoutKey, onLayout]);

  if (!quiz) return null;
  const serverNow = now + offset.current;
  const mine = quiz.mySide;
  const opponentName = mine === "a" ? quiz.nameB : quiz.nameA;
  const nameOf = (side: "a" | "b") => (side === "a" ? quiz.nameA : quiz.nameB);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  const fields = Array.from({ length: quiz.size }, (_, i) => topics[i] ?? "");
  const topicsReady = random || fields.every((f) => f.trim().length > 0);
  const submit = () => run(() => submitTopics({ quizId, topics: random ? [] : fields, random }));
  const modeButton = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("h-8 flex-1 rounded-md text-xs font-bold transition-colors", active ? "bg-app-accent text-app-accent-fg" : "text-app-text-muted hover:bg-app-field")}
    >
      {label}
    </button>
  );
  const topicInputs = (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1 rounded-lg border border-app-border bg-app-bg p-0.5">
        {modeButton(!random, `✍️ ${t("quiz.modeChoose")}`, () => setRandom(false))}
        {modeButton(random, `🎲 ${t("quiz.modeRandom")}`, () => setRandom(true))}
      </div>
      {random && <p className="rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text-muted">{t("quiz.randomHint", { count: quiz.size })}</p>}
      {!random && fields.map((value, i) => (
        <input
          key={i}
          value={value}
          maxLength={TOPIC_MAX}
          placeholder={t("quiz.topicPlaceholder", { n: i + 1 })}
          onChange={(e) => setTopics(fields.map((f, j) => (j === i ? e.target.value : f)))}
          className="h-9 rounded-lg border border-app-border-strong bg-app-field px-3 text-sm text-app-text outline-none focus:border-app-accent-bright"
        />
      ))}
    </div>
  );

  const last = quiz.rounds[quiz.rounds.length - 1];
  const countingDown = quiz.status === "playing" && quiz.endsAt !== null && serverNow < quiz.endsAt && quiz.current !== null;
  const waitingReveal = quiz.status === "playing" && quiz.endsAt !== null && !countingDown;
  const betweenRounds = quiz.status === "playing" && quiz.endsAt === null && !!last;
  const remaining = quiz.endsAt !== null ? Math.max(0, quiz.endsAt - serverNow) : 0;
  const seconds = Math.max(1, Math.ceil(remaining / 1000));
  const nextIn = quiz.nextRoundAt !== null ? Math.max(1, Math.ceil((quiz.nextRoundAt - serverNow) / 1000)) : 0;

  /** Le quattro opzioni di una domanda già chiusa: la giusta in verde, chi ha risposto cosa sotto ogni opzione. */
  const revealed = (r: NonNullable<typeof last>) => (
    <div className="flex flex-col gap-1.5">
      {r.options.map((option, i) => {
        const pickedBy = (["a", "b"] as const).filter((side) => (side === "a" ? r.a : r.b) === i);
        const correct = i === r.correct;
        const wrong = pickedBy.length > 0 && !correct;
        return (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              correct ? "border-app-online bg-app-online-bg font-bold text-app-online" : wrong ? "border-destructive/60 bg-destructive/10 text-app-text" : "border-app-border bg-app-bg text-app-text-muted",
            )}
          >
            <span className="w-4 shrink-0 text-xs font-extrabold opacity-70">{LETTERS[i]}</span>
            <span className="min-w-0 flex-1 break-words">{option}</span>
            {pickedBy.map((side) => (
              <span key={side} className="shrink-0 rounded-md bg-black/25 px-1.5 py-0.5 text-[11px] font-bold text-white">
                {nameOf(side)}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      data-testid="quiz-card"
      className="mt-1.5 flex w-[min(520px,100%)] flex-col gap-3 rounded-[calc(14px*var(--radius-scale))] border-2 border-app-border-strong bg-app-field/50 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-app-text-strong">🧠 {t("quiz.title")}</div>
        <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">{t("quiz.questions", { count: quiz.total })}</span>
      </div>

      {quiz.status === "setup" &&
        (mine === "a" ? (
          <>
            <p className="text-sm font-semibold text-app-text">{t("quiz.yourTopics", { count: quiz.size })}</p>
            {topicInputs}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!topicsReady}
                onClick={() => void submit()}
                className={cn(primaryButtonClass, "h-9 px-4 text-sm")}
              >
                {t("quiz.sendChallenge")}
              </button>
              <button type="button" onClick={() => void run(() => respond({ quizId, action: "cancel" }))} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
                {t("game.cancel")}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-app-text-muted">{t("quiz.preparing", { name: quiz.nameA })}</p>
        ))}

      {quiz.status === "invite" &&
        (mine === "b" ? (
          <>
            <p className="text-sm font-semibold text-app-text">{t("quiz.challenge", { name: quiz.nameA, count: quiz.size })}</p>
            {topicInputs}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!topicsReady}
                onClick={() => void submit()}
                className={cn(primaryButtonClass, "h-9 px-4 text-sm")}
              >
                {t("game.accept")}
              </button>
              <button type="button" onClick={() => void run(() => respond({ quizId, action: "decline" }))} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
                {t("game.decline")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-app-text">{t("game.challengeSent", { name: quiz.nameB })}</p>
            <button type="button" onClick={() => void run(() => respond({ quizId, action: "cancel" }))} className={cn(outlineButtonClass, "h-9 self-start px-4 text-sm")}>
              {t("game.cancel")}
            </button>
          </>
        ))}

      {quiz.status === "generating" && (
        <p className="flex items-center gap-2 text-sm font-semibold text-app-text-muted">
          <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
          {t("quiz.generating")}
        </p>
      )}
      {quiz.status === "failed" && <p className="text-sm text-destructive">{t("quiz.failed")}</p>}
      {quiz.status === "declined" && <p className="text-sm text-app-text-muted">{t("game.declined", { name: quiz.nameB })}</p>}
      {quiz.status === "cancelled" && <p className="text-sm text-app-text-muted">{t("game.cancelled")}</p>}

      {(quiz.status === "playing" || quiz.status === "done") && (
        <div className="flex items-stretch gap-2">
          {(["a", "b"] as const).map((side) => {
            const lead = quiz.status === "done" && quiz.winnerSide === side;
            return (
              <div key={side} className={cn("flex min-w-0 flex-1 flex-col items-center rounded-xl border px-2 py-2", lead ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-app-bg")}>
                <span className="max-w-full truncate text-xs font-semibold text-app-text-muted">
                  {nameOf(side)}
                  {side === mine ? ` (${t("game.you")})` : ""}
                </span>
                <span className="text-2xl font-extrabold text-app-text-strong">{side === "a" ? quiz.scoreA : quiz.scoreB}</span>
              </div>
            );
          })}
        </div>
      )}

      {countingDown && quiz.current && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs font-bold tracking-wide text-app-text-muted uppercase">
            <span>{t("quiz.round", { n: quiz.roundNo, total: quiz.total })}</span>
            <span className="tabular-nums">{seconds}s</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-app-border">
            <div className="h-full rounded-full bg-app-accent transition-[width] duration-200 ease-linear" style={{ width: `${(remaining / QUIZ_COUNTDOWN_MS) * 100}%` }} />
          </div>
          <div className="text-xs font-bold text-app-accent-text">{t("quiz.topic", { topic: quiz.current.topic })}</div>
          <div className="text-[15px] leading-snug font-bold text-app-text-strong">{quiz.current.text}</div>
          <div className="flex flex-col gap-1.5">
            {quiz.current.options.map((option, i) => (
              <button
                key={i}
                type="button"
                disabled={!mine}
                aria-pressed={quiz.myPick === i}
                onClick={() => void run(() => answer({ quizId, option: i }))}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  quiz.myPick === i ? "border-app-accent bg-app-accent-soft font-bold text-app-text-strong" : "border-app-border bg-app-bg text-app-text hover:bg-app-field",
                )}
              >
                <span className="w-4 shrink-0 text-xs font-extrabold opacity-70">{LETTERS[i]}</span>
                <span className="min-w-0 flex-1 break-words">{option}</span>
              </button>
            ))}
          </div>
          <div className="text-xs text-app-text-dim">
            {quiz.myPick !== null ? t("quiz.lockedIn") : t("quiz.pickNow")}
            {quiz.opponentPicked ? ` · ${t("quiz.opponentAnswered", { name: opponentName })}` : ""}
          </div>
        </div>
      )}

      {waitingReveal && <p className="text-center text-sm font-semibold text-app-text-muted">{t("game.revealing")}</p>}

      {(betweenRounds || quiz.status === "done") && last && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-bold text-app-accent-text">{t("quiz.topic", { topic: last.topic })}</div>
          <div className="text-[15px] leading-snug font-bold text-app-text-strong">{last.text}</div>
          {revealed(last)}
          {betweenRounds && <div className="text-center text-xs text-app-text-dim">{t("game.nextIn", { n: nextIn })}</div>}
        </div>
      )}

      {quiz.status === "done" && (
        <div className="flex flex-col items-center gap-2 border-t border-app-border pt-3">
          <div className="text-center text-[15px] font-extrabold text-app-text-strong">
            {quiz.winnerSide ? t("game.winner", { name: nameOf(quiz.winnerSide) }) : t("game.tie")}
          </div>
          {mine && (
            <button
              type="button"
              onClick={() => void run(() => start({ conversationId: quiz.conversationId, size: quiz.size, language }))}
              className={cn(outlineButtonClass, "h-9 px-4 text-sm")}
            >
              {t("game.rematch")}
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

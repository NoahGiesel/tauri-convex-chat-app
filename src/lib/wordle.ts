import type { MessageKey } from "@/i18n/en";
import type { OutcomeReason, ResultSummary, WordleLanguage } from "../../convex/wordleRules";

/** `/wordle` resta nascosto fino al rilascio: solo in sviluppo e nella build di test dell'E2E. */
export const WORDLE_ENABLED = import.meta.env.DEV || import.meta.env.VITE_E2E === "1";

/** Nome della lingua della parola, scritto sempre nella lingua stessa. */
export const WORDLE_LANGUAGE_NAME: Record<WordleLanguage, string> = { it: "Italiano", en: "English" };

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Tempo che manca in ore e minuti ("23 h 59 min", "12 min"), arrotondato al minuto per eccesso. */
export function formatHoursMinutes(ms: number, t: Translate): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t("wordle.hoursMinutes", { h, m }) : t("wordle.minutesOnly", { m });
}

/** Tempo in "m:ss", per il Run timer e il tempo di una Run. */
export function formatMinutesSeconds(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** La riga di chiusura di ogni esito con un vincitore; i pareggi e i Duel scaduti hanno la loro. */
const RESULT_LINE: Record<Exclude<OutcomeReason, "neitherGuessed">, MessageKey> = {
  fewerGuesses: "wordle.result.fewerGuesses",
  fasterRun: "wordle.result.fasterRun",
  onlyOneGuessed: "wordle.result.onlyOneGuessed",
  forfeit: "wordle.result.forfeit",
};

/** La riga che annuncia la chiusura del Duel, in chat e nella notifica. */
export function formatWordleResult(r: ResultSummary, t: Translate): string {
  if (r.status === "expired" || r.reason === null) return t("wordle.duelExpired");
  if (r.winnerName === null || r.reason === "neitherGuessed") return t(r.reason === "neitherGuessed" ? "wordle.result.draw" : "wordle.result.tie");
  return t(RESULT_LINE[r.reason], { name: r.winnerName, n: r.winnerGuesses ?? 0, m: r.otherGuesses ?? 0 });
}

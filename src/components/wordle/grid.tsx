import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { MAX_GUESSES, WORD_LENGTH, type TileColor, type WordleLanguage } from "../../../convex/wordleRules";
import { TILE_CLASS, Tile } from "./tile";

export interface ScoredGuess {
  word: string;
  colors: TileColor[];
}

/** Lettere che la tastiera italiana nasconde (e che la tastiera fisica non scrive). */
export const ITALIAN_HIDDEN = new Set(["j", "k", "w", "x", "y"]);
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const RANK: Record<TileColor, number> = { absent: 0, present: 1, correct: 2 };

/** La griglia di una Run: i tentativi colorati, la riga che si sta scrivendo, le righe vuote. */
export function Grid({
  guesses,
  typed = "",
  rows = MAX_GUESSES,
  size = "md",
  shakeKey = 0,
}: {
  guesses: ScoredGuess[];
  typed?: string;
  rows?: number;
  size?: "sm" | "md" | "lg";
  /** Cambia a ogni tentativo respinto: la riga in corso trema. */
  shakeKey?: number;
}) {
  const gap = size === "sm" ? "gap-[3px]" : "gap-1.5";
  return (
    <div className={cn("flex flex-col", gap)}>
      {Array.from({ length: rows }, (_, r) => {
        const guess = guesses[r];
        const current = r === guesses.length;
        return (
          <div
            key={current ? `typing-${shakeKey}` : r}
            aria-label={guess?.word.toUpperCase()}
            className={cn("flex", gap, current && shakeKey > 0 && "animate-[wordle-shake_0.35s]")}
          >
            {Array.from({ length: WORD_LENGTH }, (_, i) =>
              guess ? (
                <Tile key={i} size={size} letter={guess.word[i]} kind={guess.colors[i]} />
              ) : current && typed[i] ? (
                <Tile key={i} size={size} letter={typed[i]} kind="typed" />
              ) : (
                <Tile key={i} size={size} kind="empty" />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Il colore migliore già visto per ogni lettera, per colorare la tastiera. */
function keyColors(guesses: ScoredGuess[]): Map<string, TileColor> {
  const out = new Map<string, TileColor>();
  for (const g of guesses) {
    [...g.word].forEach((ch, i) => {
      const prev = out.get(ch);
      if (!prev || RANK[g.colors[i]] > RANK[prev]) out.set(ch, g.colors[i]);
    });
  }
  return out;
}

const keyClass = "flex h-11 items-center justify-center rounded-md border font-bold uppercase transition-colors";
const plainKey = "border-transparent bg-app-field text-app-text-strong hover:bg-app-raised";

/** Tastiera sullo schermo. Ogni tasto ha un nome accessibile; quella italiana nasconde j, k, w, x, y. */
export function Keyboard({ language, guesses, onKey }: { language: WordleLanguage; guesses: ScoredGuess[]; onKey: (key: string) => void }) {
  const { t } = useI18n();
  const colors = keyColors(guesses);
  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      {ROWS.map((row, r) => (
        <div key={r} className="flex gap-1">
          {r === 2 && (
            <button type="button" onClick={() => onKey("Enter")} className={cn(keyClass, plainKey, "px-3 text-[11px]")}>
              {t("wordle.enter")}
            </button>
          )}
          {[...row]
            .filter((ch) => language !== "it" || !ITALIAN_HIDDEN.has(ch))
            .map((ch) => {
              const color = colors.get(ch);
              return (
                <button
                  key={ch}
                  type="button"
                  aria-label={ch.toUpperCase()}
                  onClick={() => onKey(ch)}
                  className={cn(keyClass, "w-9 text-sm", color ? TILE_CLASS[color] : plainKey)}
                >
                  {ch}
                </button>
              );
            })}
          {r === 2 && (
            <button type="button" aria-label={t("wordle.backspace")} title={t("wordle.backspace")} onClick={() => onKey("Backspace")} className={cn(keyClass, plainKey, "px-3 text-sm")}>
              ⌫
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

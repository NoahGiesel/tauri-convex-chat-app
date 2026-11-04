// PROTOTYPE, throwaway. Grid, keyboard and Run surface of the Wordle Duel (wayfinder ticket #75).
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { outlineButtonClass } from "@/lib/ui-classes";
import { EXCLUDED_IT, HOUR, THEM, fmt, fmtHours, runMs, type Color, type Duel, type Guess, type Lang } from "./model";

export type ItKeyboard = "hide" | "grey";

const TILE: Record<Color | "empty" | "typed", string> = {
  g: "border-transparent bg-app-online text-app-bg",
  y: "border-transparent bg-app-upload text-app-bg",
  x: "border-transparent bg-app-raised text-app-text-dim",
  empty: "border-app-border bg-transparent",
  typed: "border-app-border-strong bg-app-field text-app-text-strong",
};

export function Tile({ ch, kind, size = "md" }: { ch?: string; kind: keyof typeof TILE; size?: "sm" | "md" | "lg" }) {
  const box = size === "sm" ? "h-[18px] w-[18px] text-[10px] rounded-[4px] border" : size === "lg" ? "h-14 w-14 text-2xl rounded-lg border-2" : "h-11 w-11 text-xl rounded-lg border-2";
  return <div className={cn("flex items-center justify-center font-extrabold uppercase", box, TILE[kind])}>{ch}</div>;
}

export function Grid({ guesses, typed = "", size = "md", shake = false, rows = 6, showLetters = true }: { guesses: Guess[]; typed?: string; size?: "sm" | "md" | "lg"; shake?: boolean; rows?: number; showLetters?: boolean }) {
  return (
    <div className={cn("flex flex-col", size === "sm" ? "gap-[3px]" : "gap-1.5")}>
      {Array.from({ length: rows }, (_, r) => {
        const g = guesses[r];
        const current = r === guesses.length;
        return (
          <div key={r} className={cn("flex", size === "sm" ? "gap-[3px]" : "gap-1.5", current && shake && "animate-[wd-shake_0.35s]")}>
            {Array.from({ length: 5 }, (_, i) =>
              g ? (
                <Tile key={i} size={size} ch={showLetters ? g.word[i] : undefined} kind={g.colors[i]} />
              ) : current && typed[i] ? (
                <Tile key={i} size={size} ch={typed[i]} kind="typed" />
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

function keyColors(guesses: Guess[]) {
  const rank: Record<Color, number> = { x: 0, y: 1, g: 2 };
  const out: Record<string, Color> = {};
  for (const g of guesses) for (let i = 0; i < 5; i++) {
    const prev = out[g.word[i]];
    if (!prev || rank[g.colors[i]] > rank[prev]) out[g.word[i]] = g.colors[i];
  }
  return out;
}

export function Keyboard({ lang, guesses, onKey, itMode, compact }: { lang: Lang; guesses: Guess[]; onKey: (k: string) => void; itMode: ItKeyboard; compact?: boolean }) {
  const colors = keyColors(guesses);
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      {rows.map((row, r) => (
        <div key={r} className="flex gap-1">
          {r === 2 && <Key wide label="Enter" onClick={() => onKey("Enter")} compact={compact} />}
          {[...row].map((ch) => {
            const excluded = lang === "it" && EXCLUDED_IT.has(ch);
            if (excluded && itMode === "hide") return null;
            const c = colors[ch];
            return (
              <Key
                key={ch}
                label={ch}
                disabled={excluded}
                compact={compact}
                className={c ? TILE[c] : "border-transparent bg-app-field text-app-text-strong hover:bg-app-raised"}
                onClick={() => onKey(ch)}
              />
            );
          })}
          {r === 2 && <Key wide label="⌫" onClick={() => onKey("Backspace")} compact={compact} />}
        </div>
      ))}
    </div>
  );
}

function Key({ label, onClick, wide, disabled, className, compact }: { label: string; onClick: () => void; wide?: boolean; disabled?: boolean; className?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-md border font-bold uppercase transition-colors",
        compact ? "h-9 text-xs" : "h-11 text-sm",
        wide ? (compact ? "px-2 text-[10px]" : "px-3 text-[11px]") : compact ? "w-7" : "w-9",
        disabled ? "cursor-not-allowed border-dashed border-app-border bg-transparent text-app-text-dim/40" : className ?? "border-transparent bg-app-field text-app-text-strong hover:bg-app-raised",
      )}
    >
      {label}
    </button>
  );
}

export type SubmitResult = "ok" | "short" | "invalid";

/** The playing surface: Run timer, grid, keyboard, rejection message, end of Run. Placement is the variant's job. */
export function RunSurface({
  duel,
  now,
  onGuess,
  itMode,
  compact,
  onClose,
  onGiveUp,
}: {
  duel: Duel;
  now: number;
  onGuess: (word: string) => SubmitResult;
  onGiveUp: () => void;
  itMode: ItKeyboard;
  compact?: boolean;
  onClose?: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const me = duel.me;
  const playing = me.state === "playing";
  const left = me.startedAt !== undefined ? me.startedAt + duel.timer * 60_000 - now : duel.timer * 60_000;

  function key(k: string) {
    if (!playing) return;
    if (k === "Enter") {
      const r = onGuess(typed);
      if (r === "ok") {
        setTyped("");
        setMsg(null);
      } else {
        setMsg(r === "short" ? "Not enough letters" : duel.lang === "it" ? `"${typed.toUpperCase()}" is not in the Italian list. It doesn't count.` : `"${typed.toUpperCase()}" is not in the English list. It doesn't count.`);
        setShake((s) => s + 1);
      }
      return;
    }
    if (k === "Backspace") return setTyped((t) => t.slice(0, -1));
    if (/^[a-z]$/.test(k) && typed.length < 5) {
      if (duel.lang === "it" && EXCLUDED_IT.has(k)) return;
      setTyped((t) => t + k);
    }
  }

  useEffect(() => {
    if (!playing) return;
    const onDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key === "Enter" || e.key === "Backspace" ? e.key : e.key.toLowerCase();
      if (k === "Enter" || k === "Backspace" || /^[a-z]$/.test(k)) {
        e.preventDefault();
        key(k);
      }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  });

  const low = left < 30_000;
  const deadline = (duel.acceptedAt ?? now) + 24 * HOUR - now;

  return (
    <div className="flex flex-col items-center gap-3">
      <style>{`@keyframes wd-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
      <div className="flex w-full items-center justify-between gap-2">
        <span className="rounded-md bg-app-field px-2 py-0.5 text-[11px] font-bold text-app-text-muted">
          {duel.lang.toUpperCase()} · {me.guesses.length}/6
        </span>
        {playing ? (
          <span className={cn("rounded-lg px-2.5 py-1 text-lg font-extrabold tabular-nums", low ? "bg-destructive/15 text-destructive" : "bg-app-accent-soft text-app-accent-text")}>⏱ {fmt(left)}</span>
        ) : (
          <span className="text-xs font-bold text-app-text-muted">Run finished</span>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-md px-2 py-0.5 text-xs font-bold text-app-text-muted hover:bg-app-field" title="The Run timer keeps running">
            Close ✕
          </button>
        )}
      </div>
      {playing && <p className="-mt-1 text-[11px] text-app-text-dim">The timer never pauses: closing this or leaving the app does not stop it.</p>}

      <Grid key={shake} guesses={me.guesses} typed={typed} shake={shake > 0} size={compact ? "md" : "lg"} />

      <div className="h-5 text-center text-xs font-semibold text-destructive" aria-live="polite">{playing ? msg : null}</div>

      {playing ? (
        <>
          <Keyboard lang={duel.lang} guesses={me.guesses} onKey={key} itMode={itMode} compact={compact} />
          {confirmGiveUp ? (
            <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-center">
              <span className="text-sm font-semibold text-app-text-strong">Give up? Your Run ends now and counts as not guessed.</span>
              <div className="flex gap-2">
                <button type="button" onClick={onGiveUp} className="h-8 rounded-xl bg-destructive px-3 text-xs font-extrabold text-white hover:opacity-90">
                  Yes, give up
                </button>
                <button type="button" onClick={() => setConfirmGiveUp(false)} className={cn(outlineButtonClass, "h-8 px-3 text-xs")}>
                  Keep playing
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmGiveUp(true)} className="text-xs font-bold text-app-text-muted underline-offset-2 hover:text-destructive hover:underline">
              🏳 Give up
            </button>
          )}
        </>
      ) : (
        <div className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-app-border bg-app-bg p-3 text-center">
          <div className="text-[15px] font-extrabold text-app-text-strong">
            {me.solved ? `Guessed in ${me.guesses.length} · ${fmt(runMs(me, duel.timer))}` : me.timedOut ? "Time's up: word not guessed" : me.gaveUp ? "You gave up: word not guessed" : "Six misses: word not guessed"}
          </div>
          {duel.status === "open" && duel.them.state !== "finished" && (
            <div className="text-sm text-app-text-muted">
              {THEM} {duel.them.state === "playing" ? "is playing now" : "has not played yet"}. The result and the word appear when {THEM} finishes, or when the Duel closes in {fmtHours(deadline)}.
            </div>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className={cn(outlineButtonClass, "mt-1 h-8 px-3 text-xs")}>
              Back to chat
            </button>
          )}
        </div>
      )}
    </div>
  );
}

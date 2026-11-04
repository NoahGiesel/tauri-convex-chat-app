// PROTOTYPE, throwaway. Three shapes of the `/wordle` setup panel (wayfinder ticket #75).
import { useState } from "react";
import { cn } from "@/lib/utils";
import { outlineButtonClass, primaryButtonClass, sectionLabelClass } from "@/lib/ui-classes";
import { THEM, type Lang, type Timer } from "./model";

export type SetupProps = { onSend: (timer: Timer, lang: Lang) => void; onCancel: () => void };
const TIMERS: Timer[] = [1, 5, 10];
const LANGS: { key: Lang; label: string }[] = [
  { key: "it", label: "Italiano" },
  { key: "en", label: "English" },
];

function Seg<T extends string | number>({ options, value, onChange, render }: { options: T[]; value: T; onChange: (v: T) => void; render: (v: T) => string }) {
  return (
    <div className="flex gap-1 rounded-xl border border-app-border bg-app-bg p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={cn("flex-1 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors", o === value ? "bg-app-accent text-app-accent-fg" : "text-app-text hover:bg-app-field")}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

/** A: small popover above the composer, where the slash suggestions appear. */
export function SetupPopover({ onSend, onCancel }: SetupProps) {
  const [timer, setTimer] = useState<Timer>(5);
  const [lang, setLang] = useState<Lang>("it");
  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 flex w-[320px] flex-col gap-3 rounded-xl border border-app-border-strong bg-app-panel p-3 shadow-xl">
      <div className="text-sm font-extrabold text-app-text-strong">Challenge {THEM} to a Wordle Duel</div>
      <div className="flex flex-col gap-1">
        <span className={sectionLabelClass}>Run timer</span>
        <Seg options={TIMERS} value={timer} onChange={setTimer} render={(t) => `${t} min`} />
      </div>
      <div className="flex flex-col gap-1">
        <span className={sectionLabelClass}>Word language</span>
        <Seg options={LANGS.map((l) => l.key)} value={lang} onChange={setLang} render={(k) => LANGS.find((l) => l.key === k)!.label} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => onSend(timer, lang)} className={cn(primaryButtonClass, "h-9 flex-1 text-sm")}>
          Send challenge
        </button>
        <button type="button" onClick={onCancel} className={cn(outlineButtonClass, "h-9 px-3 text-sm")}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** B: a modal with large option tiles and a line of rules. */
export function SetupDialog({ onSend, onCancel }: SetupProps) {
  const [timer, setTimer] = useState<Timer>(5);
  const [lang, setLang] = useState<Lang>("it");
  const blurb: Record<Timer, string> = { 1: "Blitz", 5: "Standard", 10: "Relaxed" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-backdrop" onMouseDown={onCancel}>
      <div className="flex w-[440px] flex-col gap-4 rounded-2xl border border-app-border-strong bg-app-panel p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div>
          <div className="text-lg font-extrabold text-app-text-strong">Wordle Duel with {THEM}</div>
          <p className="mt-1 text-sm text-app-text-muted">You both guess the same five-letter word, each in your own Run, within 24 h. Fewer guesses wins; on a tie, the faster Run.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={sectionLabelClass}>Run timer</span>
          <div className="grid grid-cols-3 gap-2">
            {TIMERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimer(t)}
                className={cn("flex flex-col items-center rounded-xl border-2 py-3", t === timer ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-app-bg hover:bg-app-field")}
              >
                <span className="text-2xl font-extrabold text-app-text-strong">{t}</span>
                <span className="text-xs font-semibold text-app-text-muted">min · {blurb[t]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={sectionLabelClass}>Word language</span>
          <div className="grid grid-cols-2 gap-2">
            {LANGS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLang(l.key)}
                className={cn("flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-bold text-app-text-strong", l.key === lang ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-app-bg hover:bg-app-field")}
              >
                <span className="rounded bg-app-field px-1.5 text-xs">{l.key.toUpperCase()}</span>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={cn(outlineButtonClass, "h-10 px-4 text-sm")}>
            Cancel
          </button>
          <button type="button" onClick={() => onSend(timer, lang)} className={cn(primaryButtonClass, "h-10 px-5 text-sm")}>
            Send challenge
          </button>
        </div>
      </div>
    </div>
  );
}

/** C: the composer itself turns into a one-line command bar. */
export function SetupInline({ onSend, onCancel }: SetupProps) {
  const [timer, setTimer] = useState<Timer>(5);
  const [lang, setLang] = useState<Lang>("it");
  const chip = (on: boolean) => cn("rounded-full border px-3 py-1 text-xs font-bold transition-colors", on ? "border-app-accent bg-app-accent-soft text-app-text-strong" : "border-app-border text-app-text-muted hover:bg-app-field");
  return (
    <div className="flex min-h-11 flex-1 flex-wrap items-center gap-2 px-2 py-1">
      <span className="rounded-md bg-app-accent-soft px-2 py-1 font-mono text-sm font-bold text-app-accent-text">/wordle</span>
      <span className="text-xs text-app-text-dim">timer</span>
      {TIMERS.map((t) => (
        <button key={t} type="button" onClick={() => setTimer(t)} className={chip(t === timer)}>
          {t} min
        </button>
      ))}
      <span className="ml-1 text-xs text-app-text-dim">word</span>
      {LANGS.map((l) => (
        <button key={l.key} type="button" onClick={() => setLang(l.key)} className={chip(l.key === lang)}>
          {l.key.toUpperCase()}
        </button>
      ))}
      <div className="ml-auto flex gap-1">
        <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-xs font-bold text-app-text-muted hover:bg-app-field">
          Esc
        </button>
        <button type="button" onClick={() => onSend(timer, lang)} className={cn(primaryButtonClass, "h-8 px-3 text-xs")}>
          Send ↵
        </button>
      </div>
    </div>
  );
}

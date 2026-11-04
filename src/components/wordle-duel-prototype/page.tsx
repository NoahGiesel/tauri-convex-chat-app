// PROTOTYPE, throwaway. Wordle Duel UI prototype for wayfinder ticket #75 "What do the Wordle Duel card and Run screen look like?".
// Three variants of where the Run opens (and, to match, where the `/wordle` setup lives), switchable via `?variant=`:
//   A: inside the chat card · B: a dialog over the chat · C: a side panel next to the chat.
// A mock chat column stands in for conversation-view.tsx, which needs a signed-in Convex session. All state is in memory.
import { useEffect, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/themes/theme-provider";
import { PrototypeSwitcher, useVariant } from "@/components/prototype-switcher";
import { DuelCard } from "./card";
import { RunSurface, type ItKeyboard, type SubmitResult } from "./run";
import { SetupDialog, SetupInline, SetupPopover } from "./setup";
import { HOUR, ME, SCENARIOS, SOLUTIONS, THEM, WORDS, cannedRun, decide, score, type Duel, type Lang, type Timer } from "./model";

const VARIANTS = [
  { key: "A", name: "Run inside the card" },
  { key: "B", name: "Run in a dialog" },
  { key: "C", name: "Run in a side panel" },
];

const MESSAGES = [
  { mine: false, text: "Stasera ci sei per la partita?" },
  { mine: true, text: "Sì, dopo cena. Intanto ti sfido 😏" },
];

export function WordleDuelPrototype() {
  const [variant, setVariant] = useVariant(VARIANTS.map((v) => v.key));
  const [duel, setDuel] = useState<Duel | null>(null);
  const [scenario, setScenario] = useState("none");
  const [lang, setLang] = useState<Lang>("it");
  const [itMode, setItMode] = useState<ItKeyboard>("hide");
  const [runOpen, setRunOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const now = useNow(250);

  // The Run timer is server-side and never pauses: here it runs out even with the Run closed.
  useEffect(() => {
    if (!duel || duel.me.state !== "playing" || duel.me.startedAt === undefined) return;
    if (now >= duel.me.startedAt + duel.timer * 60_000) setDuel(finishMe({ ...duel, me: { ...duel.me, state: "finished", timedOut: true, endedAt: now } }));
  }, [now, duel]);

  function load(id: string, l = lang) {
    setScenario(id);
    setRunOpen(false);
    setSetupOpen(false);
    setError(null);
    const s = SCENARIOS.find((x) => x.id === id);
    setDuel(s ? s.make(Date.now(), l) : null);
  }

  function finishMe(d: Duel): Duel {
    if (d.me.state === "finished" && d.them.state === "finished") return { ...d, status: "closed", outcome: decide(d) };
    return d;
  }

  function guess(word: string): SubmitResult {
    if (!duel) return "invalid";
    if (word.length < 5) return "short";
    if (!WORDS[duel.lang].has(word)) return "invalid";
    const t = Date.now();
    const guesses = [...duel.me.guesses, { word, colors: score(word, duel.word) }];
    const solved = word === duel.word;
    const done = solved || guesses.length === 6;
    setDuel(finishMe({ ...duel, me: { ...duel.me, guesses, solved, state: done ? "finished" : "playing", endedAt: done ? t : undefined } }));
    return "ok";
  }

  function openRun() {
    if (!duel) return;
    if (duel.me.state === "toPlay") setDuel({ ...duel, me: { ...duel.me, state: "playing", startedAt: Date.now() } });
    setRunOpen(true);
  }

  function send(timer: Timer, l: Lang) {
    setSetupOpen(false);
    setDraft("");
    const t = Date.now();
    const word = SOLUTIONS[l][Math.floor(Math.random() * SOLUTIONS[l].length)];
    setDuel({ status: "invite", iAmChallenger: true, timer, lang: l, word, me: { state: "toPlay", guesses: [], solved: false }, them: { state: "toPlay", guesses: [], solved: false }, createdAt: t });
    setScenario("custom");
  }

  function runCommand() {
    if (draft.trim() !== "/wordle") return;
    if (duel && (duel.status === "invite" || duel.status === "open")) {
      setError("A Wordle Duel is already open in this chat.");
      return;
    }
    setError(null);
    setSetupOpen(true);
  }

  // Dev actions that stand in for the other player and for the clock.
  const dev = {
    accept: () => duel && setDuel({ ...duel, status: "open", acceptedAt: Date.now() }),
    themStart: () => duel && setDuel({ ...duel, them: { ...duel.them, state: "playing", startedAt: Date.now() } }),
    themFinish: () => duel && setDuel(finishMe({ ...duel, them: cannedRun(duel.word, duel.lang, ["?", "?", "?", "*"], 95_000, Date.now()) })),
    skipTimer: () => duel?.me.startedAt !== undefined && setDuel({ ...duel, me: { ...duel.me, startedAt: Date.now() - duel.timer * 60_000 + 10_000 } }),
    deadline: () => {
      if (!duel) return;
      if (duel.status === "invite") return setDuel({ ...duel, status: "inviteExpired" });
      if (duel.status !== "open") return;
      const a = duel.me.state === "finished";
      const b = duel.them.state === "finished";
      if (!a && !b) return setDuel({ ...duel, status: "expired" });
      setDuel({ ...duel, status: "closed", me: a ? duel.me : { ...duel.me, guesses: [] }, outcome: { winner: a ? "me" : "them", reason: "forfeit" } });
      setRunOpen(false);
    },
  };

  const surface = duel && runOpen && duel.status === "open" && (
    <RunSurface duel={duel} now={now} onGuess={guess} itMode={itMode} compact={variant === "A"} onClose={() => setRunOpen(false)} />
  );

  const slash = /^\/\w*$/.test(draft) && "/wordle".startsWith(draft);

  return (
    <div className="flex h-screen bg-app-bg text-app-text">
      <FakeSidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-app-border px-5">
          <h2 className="text-[15px] font-extrabold text-app-text-strong">{THEM}</h2>
          <span className="text-xs font-semibold text-app-online">online</span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {MESSAGES.map((m, i) => (
            <Bubble key={i} mine={m.mine} text={m.text} />
          ))}
          {duel && (
            <div className="flex flex-col">
              <span className="text-xs font-bold text-app-text-muted">{duel.iAmChallenger ? ME : THEM}</span>
              <DuelCard
                duel={duel}
                now={now}
                wide={variant === "A" && runOpen}
                onAccept={dev.accept}
                onDecline={() => setDuel({ ...duel, status: "declined" })}
                onWithdraw={() => setDuel({ ...duel, status: "withdrawn" })}
                onOpenRun={openRun}
                runSlot={variant === "A" && surface ? <div className="rounded-xl border border-app-border bg-app-bg p-3">{surface}</div> : undefined}
              />
            </div>
          )}
        </div>
        <div className="shrink-0 px-5 pb-4">
          {error && <p className="mb-1 px-2 text-xs text-destructive">{error}</p>}
          <div className="relative flex items-end gap-1 rounded-2xl border border-app-border bg-app-bg p-1.5">
            {slash && !setupOpen && (
              <div className="absolute right-0 bottom-full left-0 z-30 mb-2 rounded-xl border border-app-border-strong bg-app-panel p-1 shadow-xl">
                <button type="button" onMouseDown={(e) => { e.preventDefault(); setDraft("/wordle"); }} className="flex w-full items-baseline gap-1.5 rounded-lg bg-app-accent-soft px-3 py-2 text-left text-sm">
                  <strong className="text-app-text-strong">/wordle:</strong>
                  <span className="text-app-text-muted">challenge to a Wordle Duel</span>
                </button>
              </div>
            )}
            {setupOpen && variant === "A" && <SetupPopover onSend={send} onCancel={() => setSetupOpen(false)} />}
            {setupOpen && variant === "C" ? (
              <SetupInline onSend={send} onCancel={() => setSetupOpen(false)} />
            ) : (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (slash) setDraft("/wordle");
                    if (draft.trim() === "/wordle") runCommand();
                  }
                }}
                rows={1}
                placeholder="Type /wordle and press Enter"
                className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-[11px] text-[15px] text-app-text outline-none placeholder:text-app-text-dim"
              />
            )}
          </div>
        </div>
      </main>

      {variant === "C" && surface && (
        <aside className="flex w-[380px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-app-border bg-app-panel p-4">
          <div className="text-sm font-extrabold text-app-text-strong">Your Run · Wordle Duel with {THEM}</div>
          {surface}
        </aside>
      )}
      {variant === "B" && surface && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-backdrop">
          <div className="flex w-[480px] flex-col gap-3 rounded-2xl border border-app-border-strong bg-app-panel p-5 shadow-2xl">
            <div className="text-lg font-extrabold text-app-text-strong">Wordle Duel with {THEM}</div>
            {surface}
          </div>
        </div>
      )}
      {variant === "B" && setupOpen && <SetupDialog onSend={send} onCancel={() => setSetupOpen(false)} />}

      <DevPanel
        scenario={scenario}
        onScenario={(id) => load(id)}
        lang={lang}
        onLang={(l) => {
          setLang(l);
          if (scenario !== "none" && scenario !== "custom") load(scenario, l);
        }}
        itMode={itMode}
        onItMode={setItMode}
        dev={dev}
        duel={duel}
        runOpen={runOpen}
      />
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={(k) => setVariant(k)} />
    </div>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Bubble({ mine, text }: { mine: boolean; text: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-bold text-app-text-muted">{mine ? ME : THEM}</span>
      <span className="text-[15px] text-app-text">{text}</span>
    </div>
  );
}

function FakeSidebar() {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col gap-1 border-r border-app-border bg-app-sidebar p-3">
      <div className="mb-2 px-2 text-sm font-extrabold text-app-text-strong">Chats</div>
      {[THEM, "Giulia", "Team progetto", "Luca"].map((n, i) => (
        <div key={n} className={cn("rounded-lg px-2 py-2 text-sm", i === 0 ? "bg-app-accent-soft font-bold text-app-text-strong" : "text-app-text-soft")}>
          {n}
        </div>
      ))}
    </aside>
  );
}

function DevPanel({
  scenario,
  onScenario,
  lang,
  onLang,
  itMode,
  onItMode,
  dev,
  duel,
  runOpen,
}: {
  scenario: string;
  onScenario: (id: string) => void;
  lang: Lang;
  onLang: (l: Lang) => void;
  itMode: ItKeyboard;
  onItMode: (m: ItKeyboard) => void;
  dev: Record<"accept" | "themStart" | "themFinish" | "skipTimer" | "deadline", () => unknown>;
  duel: Duel | null;
  runOpen: boolean;
}) {
  const { themes, definition, setTheme } = useTheme();
  const [open, setOpen] = useState(true);
  const btn = "rounded border border-black/30 bg-white/70 px-1.5 py-0.5 text-[11px] hover:bg-white disabled:opacity-40";
  const sel = "w-full rounded border border-black/30 bg-white px-1 py-0.5 text-[11px]";
  const state = duel
    ? {
        status: duel.status,
        you: duel.me.state,
        marco: duel.them.state,
        word: duel.word,
        timer: `${duel.timer} min`,
        lang: duel.lang,
        yourGuesses: duel.me.guesses.map((g) => g.word),
        outcome: duel.outcome ?? null,
        deadlineIn: duel.acceptedAt ? `${Math.round((duel.acceptedAt + 24 * HOUR - Date.now()) / 60_000)} min` : null,
        runOpen,
      }
    : { status: "no duel yet: type /wordle in the composer" };
  return (
    <div className="fixed top-3 right-3 z-[90] w-[290px] rounded-lg border-2 border-dashed border-black/40 bg-[#fde047] p-2 font-mono text-[11px] text-black shadow-xl">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left font-bold">
        PROTOTYPE controls {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <label>
            Scenario
            <select className={sel} value={scenario} onChange={(e) => onScenario(e.target.value)}>
              <option value="none">No duel yet (type /wordle)</option>
              {scenario === "custom" && <option value="custom">Your own challenge</option>}
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex-1">
              Word language
              <select className={sel} value={lang} onChange={(e) => onLang(e.target.value as Lang)}>
                <option value="it">IT</option>
                <option value="en">EN</option>
              </select>
            </label>
            <label className="flex-1">
              IT keys j k w x y
              <select className={sel} value={itMode} onChange={(e) => onItMode(e.target.value as ItKeyboard)}>
                <option value="hide">hidden</option>
                <option value="grey">greyed out</option>
              </select>
            </label>
          </div>
          <label>
            Theme
            <select className={sel} value={definition.id} onChange={(e) => setTheme(e.target.value)}>
              {themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={btn} disabled={duel?.status !== "invite" || !duel.iAmChallenger} onClick={dev.accept}>
              Marco accepts
            </button>
            <button type="button" className={btn} disabled={duel?.status !== "open" || duel.them.state !== "toPlay"} onClick={dev.themStart}>
              Marco starts Run
            </button>
            <button type="button" className={btn} disabled={duel?.status !== "open" || duel.them.state === "finished"} onClick={dev.themFinish}>
              Marco finishes (4 guesses)
            </button>
            <button type="button" className={btn} disabled={duel?.me.state !== "playing"} onClick={dev.skipTimer}>
              Skip my Run to last 10 s
            </button>
            <button type="button" className={btn} disabled={duel?.status !== "open" && duel?.status !== "invite"} onClick={dev.deadline}>
              Jump to 24 h deadline
            </button>
          </div>
          <div className="text-[10px] leading-tight">
            Valid guesses: a small list. Try{" "}
            {[...WORDS[duel?.lang ?? lang]].slice(5, 11).join(", ")}. The word is shown below.
          </div>
          <pre className="max-h-48 overflow-auto rounded bg-black/10 p-1 text-[10px] leading-tight whitespace-pre-wrap">{JSON.stringify(state, null, 1)}</pre>
        </div>
      )}
    </div>
  );
}

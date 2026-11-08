// PROTOTYPE (issue #101, map #99): what do the Match bar and the match detail panel look like?
// Three variants of Team pins at the top of a direct chat, switchable via `?variant=A|B|C`
// or the arrow keys. All data is fake and lives in memory; nothing touches Convex.
// Throwaway: lives on the `prototype/match-bar` branch only, never merged.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrototypeSwitcher, readVariant, useVariantParam, writeVariant } from "@/components/prototype-switcher";

// ---------- fake data ----------

type Team = { id: string; name: string; short: string; color: string; comp: string; aliases: string[]; national?: boolean };

const TEAMS: Team[] = [
  { id: "inter", name: "Inter", short: "INT", color: "#1e3a8a", comp: "Serie A", aliases: ["internazionale", "inter milan"] },
  { id: "milan", name: "AC Milan", short: "MIL", color: "#b91c1c", comp: "Serie A", aliases: ["milan"] },
  { id: "napoli", name: "Napoli", short: "NAP", color: "#0ea5e9", comp: "Serie A", aliases: [] },
  { id: "juve", name: "Juventus", short: "JUV", color: "#27272a", comp: "Serie A", aliases: ["juve"] },
  { id: "roma", name: "AS Roma", short: "ROM", color: "#9f1239", comp: "Serie A", aliases: ["roma"] },
  { id: "atleti", name: "Atlético Madrid", short: "ATM", color: "#dc2626", comp: "La Liga", aliases: ["atletico", "atleti"] },
  { id: "real", name: "Real Madrid", short: "RMA", color: "#a1a1aa", comp: "La Liga", aliases: ["real"] },
  { id: "barca", name: "Barcelona", short: "BAR", color: "#7c2d12", comp: "La Liga", aliases: ["barca", "barça"] },
  { id: "bayern", name: "Bayern Munich", short: "BAY", color: "#e11d48", comp: "Bundesliga", aliases: ["bayern", "bayern monaco", "fc bayern"] },
  { id: "psg", name: "Paris Saint Germain", short: "PSG", color: "#1d4ed8", comp: "Ligue 1", aliases: ["psg", "paris"] },
  { id: "arsenal", name: "Arsenal", short: "ARS", color: "#ef4444", comp: "Premier League", aliases: [] },
  { id: "liverpool", name: "Liverpool", short: "LIV", color: "#c2410c", comp: "Premier League", aliases: [] },
  { id: "italy", name: "Italy", short: "ITA", color: "#2563eb", comp: "National team", aliases: ["italia", "azzurri"], national: true },
];
const OPPONENT: Record<string, { name: string; short: string; color: string }> = {
  inter: { name: "Como", short: "COM", color: "#0369a1" },
  milan: { name: "Genoa", short: "GEN", color: "#991b1b" },
  napoli: { name: "Lazio", short: "LAZ", color: "#38bdf8" },
};
const opp = (id: string) => OPPONENT[id] ?? { name: "Fiorentina", short: "FIO", color: "#6d28d9" };
const team = (id: string) => TEAMS.find((t) => t.id === id)!;

type PinState = "next" | "live" | "finished";
type Side = { name: string; short: string; color: string };
type Match = { key: string; home: Side; away: Side; pinned: string[]; state: PinState; comp: string; kickoff: string };

const ME = "Stefan";
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// ---------- in-memory store ----------

type Line = { id: number; text: string };
type Proto = {
  variant: string;
  pins: string[];
  states: Record<string, PinState>;
  derby: boolean;
  noLineups: boolean;
  noStats: boolean;
  picker: { query: string; msg?: string } | null;
  lines: Line[];
  open: string | null; // match key whose detail panel is open
  expanded: boolean; // variant C: ticker list open
};
const KEYS = ["A", "B", "C"] as const;
const NAMES: Record<string, string> = { A: "Stacked bars + side drawer", B: "Chip row + inline detail", C: "One ticker + modal" };

let state: Proto = {
  variant: readVariant(KEYS),
  pins: ["inter", "milan", "napoli"],
  states: { inter: "live", milan: "next", napoli: "finished" },
  derby: false,
  noLineups: false,
  noStats: false,
  picker: null,
  lines: [],
  open: null,
  expanded: false,
};
const listeners = new Set<() => void>();
function set(patch: Partial<Proto> | ((s: Proto) => Partial<Proto>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
let lineId = 0;
const addLine = (text: string) => set((s) => ({ lines: [...s.lines, { id: ++lineId, text }] }));
function useProto() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

/** Called by the composer when `/calcio <arg>` is sent in a direct chat. */
export function protoOpenPicker(query: string) {
  set({ picker: { query } });
}

function removePin(id: string) {
  set((s) => ({ pins: s.pins.filter((p) => p !== id), open: null }));
  addLine(`${ME} unpinned ${team(id).name}`);
}

function matches(s: Proto): Match[] {
  const out: Match[] = [];
  let rest = s.pins;
  if (s.derby && s.pins.length >= 2) {
    const [a, b] = s.pins;
    out.push({ key: `${a}-${b}`, home: team(a), away: team(b), pinned: [a, b], state: s.states[a] ?? "next", comp: team(a).comp, kickoff: "Sun 9 Nov · 20:45" });
    rest = s.pins.slice(2);
  }
  for (const id of rest) {
    out.push({ key: id, home: team(id), away: opp(id), pinned: [id], state: s.states[id] ?? "next", comp: team(id).comp, kickoff: id === "milan" ? "Tue 11 Nov · 18:45" : "Sat 15 Nov · 15:00" });
  }
  return out;
}

const score = (m: Match) => (m.state === "next" ? null : m.state === "live" ? "1 – 1" : "2 – 1");
const status = (m: Match) => (m.state === "next" ? m.kickoff : m.state === "live" ? "67'" : "FT");
const rank = (m: Match) => (m.state === "live" ? 0 : m.state === "finished" ? 1 : 2);

// ---------- small pieces ----------

function Crest({ side, size = 20 }: { side: Side; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-black text-white"
      style={{ background: side.color, width: size, height: size, fontSize: size * 0.36 }}
    >
      {side.short.slice(0, 3)}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="relative flex size-2 shrink-0">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-red-500" />
    </span>
  );
}

/** X on a bar. A derby bar holds two pins, so it asks which one to remove. */
function RemoveButton({ m, className }: { m: Match; className?: string }) {
  const [menu, setMenu] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        title={m.pinned.length === 1 ? `Unpin ${team(m.pinned[0]).name}` : "Unpin…"}
        onClick={(e) => {
          e.stopPropagation();
          if (m.pinned.length === 1) removePin(m.pinned[0]);
          else setMenu((o) => !o);
        }}
        className={cn("flex size-6 items-center justify-center rounded-md text-app-text-dim hover:bg-app-field hover:text-app-text", className)}
      >
        <X className="size-3.5" strokeWidth={2.4} />
      </button>
      {menu && (
        <span className="absolute top-full right-0 z-50 mt-1 flex w-44 flex-col rounded-lg border border-app-border-strong bg-app-panel p-1 shadow-xl">
          {m.pinned.map((id) => (
            <button
              key={id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenu(false);
                removePin(id);
              }}
              className="rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-app-field"
            >
              Unpin {team(id).name}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

// ---------- detail panel content (shared; each variant frames it differently) ----------

const EVENTS = [
  { min: "12", side: "home", icon: "⚽", text: "Lautaro Martínez", sub: "assist Barella" },
  { min: "28", side: "away", icon: "⚽", text: "Nico Paz", sub: "assist Strefezza" },
  { min: "33", side: "away", icon: "🟨", text: "Perrone" },
  { min: "46", side: "home", icon: "🔁", text: "Frattesi", sub: "for Mkhitaryan" },
  { min: "61", side: "home", icon: "🟥", text: "Acerbi" },
];
const XI = (n: string) => [`${n} GK`, `${n} RB`, `${n} CB`, `${n} CB`, `${n} LB`, `${n} CM`, `${n} CM`, `${n} CM`, `${n} RW`, `${n} ST`, `${n} LW`];
const STATS: [string, string, string][] = [
  ["Possession", "58%", "42%"],
  ["Shots", "14", "8"],
  ["Shots on target", "6", "3"],
  ["Corners", "7", "2"],
  ["Fouls", "9", "13"],
  ["Offsides", "2", "1"],
];

function sections(m: Match, s: Proto) {
  const out: { id: string; label: string }[] = [];
  if (m.state !== "next") out.push({ id: "events", label: "Events" });
  if (!s.noLineups && m.state !== "next") out.push({ id: "lineups", label: "Lineups" });
  if (!s.noStats && m.state !== "next") out.push({ id: "stats", label: "Stats" });
  return out;
}

function Section({ id, m }: { id: string; m: Match }) {
  if (id === "events") {
    return (
      <ol className="flex flex-col gap-1">
        {EVENTS.filter((e) => m.state === "finished" || Number(e.min) <= 67).map((e) => (
          <li key={e.min + e.text} className={cn("flex items-center gap-2 text-[13px]", e.side === "away" && "flex-row-reverse text-right")}>
            <span className="w-8 shrink-0 text-center text-xs font-bold text-app-text-dim">{e.min}'</span>
            <span>{e.icon}</span>
            <span className="font-semibold text-app-text-strong">{e.text}</span>
            {e.sub && <span className="text-xs text-app-text-muted">{e.sub}</span>}
          </li>
        ))}
      </ol>
    );
  }
  if (id === "lineups") {
    return (
      <div className="grid grid-cols-2 gap-4 text-[13px]">
        {[m.home, m.away].map((side, i) => (
          <div key={side.name}>
            <p className="mb-1 font-bold text-app-text-strong">
              {side.name} <span className="font-normal text-app-text-muted">{i === 0 ? "3-5-2" : "4-2-3-1"}</span>
            </p>
            <ul className="text-app-text">{XI(side.short).map((p, j) => <li key={j}>{p}</li>)}</ul>
            <p className="mt-2 text-xs font-bold tracking-wide text-app-text-dim uppercase">Bench</p>
            <ul className="text-app-text-muted">{[1, 2, 3, 4, 5].map((j) => <li key={j}>{side.short} sub {j}</li>)}</ul>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {STATS.map(([label, h, a]) => (
        <div key={label} className="text-[13px]">
          <div className="flex justify-between">
            <span className="font-bold text-app-text-strong">{h}</span>
            <span className="text-app-text-muted">{label}</span>
            <span className="font-bold text-app-text-strong">{a}</span>
          </div>
          <div className="mt-0.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            <span className="bg-app-accent" style={{ flex: parseFloat(h) || 1 }} />
            <span className="bg-app-text-dim/50" style={{ flex: parseFloat(a) || 1 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailHeader({ m }: { m: Match }) {
  return (
    <div className="flex flex-col items-center gap-1 pb-3 text-center">
      <p className="text-xs text-app-text-muted">{m.comp} · San Siro</p>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 font-bold text-app-text-strong"><Crest side={m.home} size={28} />{m.home.name}</span>
        <span className="text-xl font-black tabular-nums text-app-text-strong">{score(m) ?? "vs"}</span>
        <span className="flex items-center gap-2 font-bold text-app-text-strong">{m.away.name}<Crest side={m.away} size={28} /></span>
      </div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-app-text-muted">
        {m.state === "live" && <LiveDot />}
        {m.state === "next" ? `Kick-off ${m.kickoff}` : m.state === "live" ? "Live · 67'" : "Full time"}
      </p>
    </div>
  );
}

function DetailStacked({ m, s }: { m: Match; s: Proto }) {
  return (
    <div className="flex flex-col gap-5">
      <DetailHeader m={m} />
      {sections(m, s).map((sec) => (
        <section key={sec.id}>
          <h4 className="mb-2 text-xs font-bold tracking-wide text-app-text-dim uppercase">{sec.label}</h4>
          <Section id={sec.id} m={m} />
        </section>
      ))}
    </div>
  );
}

function DetailTabs({ m, s }: { m: Match; s: Proto }) {
  const secs = sections(m, s);
  const [tab, setTab] = useState(secs[0]?.id);
  const current = secs.find((x) => x.id === tab) ?? secs[0];
  return (
    <div>
      <DetailHeader m={m} />
      {secs.length > 1 && (
        <div className="mb-3 flex justify-center gap-1">
          {secs.map((x) => (
            <button key={x.id} type="button" onClick={() => setTab(x.id)} className={cn("rounded-full px-3 py-1 text-xs font-bold", current?.id === x.id ? "bg-app-accent text-app-accent-fg" : "text-app-text-muted hover:bg-app-field")}>
              {x.label}
            </button>
          ))}
        </div>
      )}
      {current && <Section id={current.id} m={m} />}
    </div>
  );
}

// ---------- variant A: stacked thin bars, detail in a side drawer ----------

function VariantA({ s }: { s: Proto }) {
  const ms = matches(s);
  const open = ms.find((m) => m.key === s.open);
  return (
    <>
      {ms.length > 0 && (
        <div className="shrink-0 divide-y divide-app-border border-b border-app-border bg-app-panel/60">
          {ms.map((m) => (
            <div key={m.key} role="button" tabIndex={0} onClick={() => set({ open: m.key })} className="flex h-9 cursor-pointer items-center gap-2 px-5 text-[13px] hover:bg-app-field/60">
              {m.state === "live" ? <LiveDot /> : <span className="size-2" />}
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <span className="truncate text-right font-semibold text-app-text-strong">{m.home.name}</span>
                <Crest side={m.home} size={18} />
                <span className={cn("min-w-12 rounded-md px-1.5 text-center font-black tabular-nums", m.state === "next" ? "text-app-text-muted" : "bg-app-field text-app-text-strong")}>{score(m) ?? "vs"}</span>
                <Crest side={m.away} size={18} />
                <span className="truncate font-semibold text-app-text-strong">{m.away.name}</span>
              </span>
              <span className={cn("w-32 shrink-0 text-right text-xs", m.state === "live" ? "font-bold text-red-500" : "text-app-text-muted")}>{status(m)}</span>
              <RemoveButton m={m} />
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-app-backdrop/40" onClick={() => set({ open: null })}>
          <aside className="h-full w-[400px] max-w-full overflow-y-auto border-l border-app-border bg-app-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => set({ open: null })} className="float-right rounded-md p-1 text-app-text-muted hover:bg-app-field"><X className="size-4" /></button>
            <DetailStacked m={open} s={s} />
          </aside>
        </div>
      )}
    </>
  );
}

// ---------- variant B: one horizontal row of chips, detail expands inline under it ----------

function VariantB({ s }: { s: Proto }) {
  const ms = matches(s);
  const open = ms.find((m) => m.key === s.open);
  if (ms.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-app-border">
      <div className="flex h-11 items-center gap-2 overflow-x-auto px-5">
        {ms.map((m) => (
          <div
            key={m.key}
            role="button"
            tabIndex={0}
            onClick={() => set({ open: s.open === m.key ? null : m.key })}
            className={cn(
              "flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border pr-1 pl-2 text-xs",
              s.open === m.key ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-app-field/50 hover:bg-app-field",
            )}
          >
            {m.state === "live" && <LiveDot />}
            <Crest side={m.home} size={18} />
            <span className="font-bold text-app-text-strong">{m.home.short}</span>
            <span className={cn("font-black tabular-nums", m.state === "next" ? "text-app-text-muted" : "text-app-text-strong")}>{score(m) ?? "–"}</span>
            <span className="font-bold text-app-text-strong">{m.away.short}</span>
            <Crest side={m.away} size={18} />
            <span className={cn("ml-1", m.state === "live" ? "font-bold text-red-500" : "text-app-text-muted")}>{m.state === "next" ? m.kickoff.split(" · ")[0] + " " + m.kickoff.split(" · ")[1] : status(m)}</span>
            <RemoveButton m={m} className="size-5" />
          </div>
        ))}
      </div>
      {open && (
        <div className="max-h-[45vh] overflow-y-auto border-t border-app-border bg-app-panel px-6 py-4">
          <div className="mx-auto max-w-[560px]">
            <DetailTabs key={open.key} m={open} s={s} />
          </div>
          <button type="button" onClick={() => set({ open: null })} className="mx-auto mt-3 flex items-center gap-1 text-xs text-app-text-muted hover:text-app-text">
            <ChevronUp className="size-3.5" /> Close
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- variant C: one ticker bar with the hottest match, others behind "+N", detail in a modal ----------

function VariantC({ s }: { s: Proto }) {
  const ms = [...matches(s)].sort((a, b) => rank(a) - rank(b));
  const open = ms.find((m) => m.key === s.open);
  if (ms.length === 0) return null;
  const Row = ({ m, top }: { m: Match; top?: boolean }) => (
    <div role="button" tabIndex={0} onClick={() => set({ open: m.key, expanded: false })} className={cn("flex h-10 cursor-pointer items-center gap-2.5 px-5 text-[13px] hover:bg-app-field/60", !top && "border-t border-app-border")}>
      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-black", m.state === "live" ? "bg-red-500 text-white" : m.state === "finished" ? "bg-app-field text-app-text-muted" : "bg-app-accent-soft text-app-accent-text")}>
        {m.state === "live" ? "LIVE 67'" : m.state === "finished" ? "FT" : "NEXT"}
      </span>
      <Crest side={m.home} size={18} />
      <span className="font-semibold text-app-text-strong">{m.home.name}</span>
      <span className="font-black tabular-nums text-app-text-strong">{score(m) ?? "vs"}</span>
      <span className="font-semibold text-app-text-strong">{m.away.name}</span>
      <Crest side={m.away} size={18} />
      {m.state === "next" && <span className="text-xs text-app-text-muted">{m.kickoff}</span>}
      <span className="flex-1" />
      <RemoveButton m={m} />
    </div>
  );
  return (
    <div className="relative z-20 shrink-0 border-b border-app-border bg-app-panel/60">
      <div className="flex items-center">
        <div className="min-w-0 flex-1"><Row m={ms[0]} top /></div>
        {ms.length > 1 && (
          <button type="button" onClick={() => set({ expanded: !s.expanded })} className="mr-4 flex items-center gap-0.5 rounded-full bg-app-field px-2 py-0.5 text-xs font-bold text-app-text-muted hover:text-app-text">
            +{ms.length - 1} {s.expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        )}
      </div>
      {s.expanded && (
        <div className="absolute inset-x-0 top-full border-b border-app-border bg-app-panel shadow-xl">
          {ms.slice(1).map((m) => <Row key={m.key} m={m} />)}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-backdrop/60 p-6" onClick={() => set({ open: null })}>
          <div className="max-h-[85vh] w-[720px] max-w-full overflow-y-auto rounded-2xl border border-app-border bg-app-panel p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <DetailHeader m={open} />
            <div className="grid gap-6 md:grid-cols-2">
              {sections(open, s).filter((x) => x.id !== "lineups").map((x) => (
                <section key={x.id}>
                  <h4 className="mb-2 text-xs font-bold tracking-wide text-app-text-dim uppercase">{x.label}</h4>
                  <Section id={x.id} m={open} />
                </section>
              ))}
            </div>
            {sections(open, s).some((x) => x.id === "lineups") && (
              <section className="mt-6">
                <h4 className="mb-2 text-xs font-bold tracking-wide text-app-text-dim uppercase">Lineups</h4>
                <Section id="lineups" m={open} />
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- mount points used by conversation-view (direct chats, dev only) ----------

export function TeamPinsPrototype() {
  const s = useProto();
  const setVariant = (v: string) => {
    writeVariant(v);
    set({ variant: v, open: null, expanded: false });
  };
  useVariantParam(KEYS, s.variant, setVariant);
  const cycle = (id: string) => set((p) => ({ states: { ...p.states, [id]: p.states[id] === "next" ? "live" : p.states[id] === "live" ? "finished" : "next" } }));
  const preset = (n: number) => set({ pins: ["inter", "milan", "napoli"].slice(0, n), open: null });
  const toggle = (k: "derby" | "noLineups" | "noStats") => set((p) => ({ [k]: !p[k] }));
  const btn = "rounded-md bg-white/10 px-2 py-0.5 hover:bg-white/20";
  const on = "bg-yellow-400 text-black hover:bg-yellow-300";
  return (
    <>
      {s.variant === "A" && <VariantA s={s} />}
      {s.variant === "B" && <VariantB s={s} />}
      {s.variant === "C" && <VariantC s={s} />}
      <PrototypeSwitcher keys={KEYS} names={NAMES} current={s.variant} onChange={setVariant}>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" className={cn(btn, s.pins.length === n && on)} onClick={() => preset(n)}>{n} pin{n > 1 && "s"}</button>
          ))}
          <span className="mx-1 text-white/40">|</span>
          {s.pins.map((id) => (
            <button key={id} type="button" className={btn} title="Click to cycle next / live / finished" onClick={() => cycle(id)}>
              {team(id).short}: {s.states[id] ?? "next"}
            </button>
          ))}
          <span className="mx-1 text-white/40">|</span>
          <button type="button" className={cn(btn, s.derby && on)} onClick={() => toggle("derby")}>derby</button>
          <button type="button" className={cn(btn, s.noLineups && on)} onClick={() => toggle("noLineups")}>no lineups</button>
          <button type="button" className={cn(btn, s.noStats && on)} onClick={() => toggle("noStats")}>no stats</button>
        </div>
      </PrototypeSwitcher>
    </>
  );
}

/** The `/calcio` picker, mounted inside the composer box (above it, like the command suggestions). */
export function CalcioPickerPrototype() {
  const s = useProto();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (s.picker) input.current?.focus();
  }, [s.picker !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s.picker) return null;
  const q = fold(s.picker.query);
  const results = q ? TEAMS.filter((t) => fold(t.name).includes(q) || t.aliases.some((a) => fold(a).includes(q))).slice(0, 6) : TEAMS.slice(0, 6);
  function choose(t: Team) {
    if (state.pins.includes(t.id)) return set({ picker: { query: state.picker!.query, msg: `${t.name} is already pinned` } });
    if (state.pins.length >= 3) return set({ picker: { query: state.picker!.query, msg: "This chat already has 3 Team pins. Remove one first." } });
    set((p) => ({ pins: [...p.pins, t.id], states: { ...p.states, [t.id]: p.states[t.id] ?? "next" }, picker: null }));
    addLine(`${ME} pinned ${t.name}`);
  }
  return (
    <div className="absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border border-app-border-strong bg-app-panel p-1 shadow-xl">
      <div className="flex items-center gap-2 px-2 pt-1 pb-1.5">
        <span className="text-xs font-bold text-app-text-muted">/calcio</span>
        <input
          ref={input}
          value={s.picker.query}
          onChange={(e) => set({ picker: { query: e.target.value } })}
          onKeyDown={(e) => {
            if (e.key === "Escape") set({ picker: null });
            if (e.key === "Enter" && results[0]) choose(results[0]);
          }}
          placeholder="team name"
          className="min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none"
        />
        <button type="button" onClick={() => set({ picker: null })} className="rounded p-0.5 text-app-text-dim hover:text-app-text"><X className="size-3.5" /></button>
      </div>
      {s.picker.msg && <p className="mx-2 mb-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{s.picker.msg}</p>}
      {results.length === 0 && <p className="px-3 py-2 text-sm text-app-text-muted">No team matches “{s.picker.query}”.</p>}
      {results.map((t) => (
        <button key={t.id} type="button" onClick={() => choose(t)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-app-field">
          <Crest side={t} size={22} />
          <span className="font-semibold text-app-text-strong">{t.name}</span>
          <span className="text-xs text-app-text-muted">{t.comp}</span>
          {state.pins.includes(t.id) && <span className="ml-auto text-xs text-app-text-dim">pinned</span>}
        </button>
      ))}
    </div>
  );
}

/** System lines ("Stefan pinned Inter"), shown at the end of the message list. */
export function PinLinesPrototype() {
  const s = useProto();
  return (
    <>
      {s.lines.map((l) => (
        <div key={l.id} className="my-2 flex justify-center">
          <span className="rounded-full border border-app-border bg-app-field/60 px-3 py-1 text-xs font-semibold text-app-text-muted">📌 {l.text}</span>
        </div>
      ))}
    </>
  );
}

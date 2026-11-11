// PROTOTYPE (issue #131, map #125): what does the richer match drawer look like?
// Three variants of the drawer, beside the chat (the chat narrows), switchable via `?variant=A|B|C`
// or the arrow keys. Tabs Match / Matches / Standings. All data is fake and in memory; nothing touches Convex.
// Throwaway: lives on the `prototype/match-drawer` branch only, never merged. Dev builds only.
import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, ListOrdered, Pin, Shirt, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/themes/theme-provider";
import { PrototypeSwitcher, readVariant, useVariantParam, writeVariant } from "@/components/prototype-switcher";

// ───────────────────────── fake data ─────────────────────────

type Side = "home" | "away";
type TeamInfo = { name: string; short: string; color: string; ink: string };
type Player = { n: number; name: string };
type Lineup = { formation: string; rows: Player[][]; bench: Player[] };
type EventKind = "goal" | "yellow" | "red" | "sub";
type Ev = { min: string; kind: EventKind; side: Side; player: string; other?: string };

const HOME: TeamInfo = { name: "Inter", short: "INT", color: "#1d4ed8", ink: "#ffffff" };
const AWAY: TeamInfo = { name: "Como", short: "COM", color: "#e2e8f0", ink: "#0f172a" };

// Rows from the back; each row ordered from the team's own left to its right.
const LINEUPS: Record<Side, Lineup> = {
  home: {
    formation: "3-5-2",
    rows: [
      [{ n: 1, name: "Sommer" }],
      [{ n: 95, name: "Bastoni" }, { n: 15, name: "Acerbi" }, { n: 28, name: "Pavard" }],
      [{ n: 32, name: "Dimarco" }, { n: 22, name: "Mkhitaryan" }, { n: 20, name: "Çalhanoğlu" }, { n: 23, name: "Barella" }, { n: 2, name: "Dumfries" }],
      [{ n: 10, name: "Lautaro" }, { n: 9, name: "Thuram" }],
    ],
    bench: [{ n: 16, name: "Frattesi" }, { n: 7, name: "Zieliński" }, { n: 99, name: "Taremi" }, { n: 31, name: "Bisseck" }, { n: 12, name: "Di Gennaro" }, { n: 36, name: "Darmian" }],
  },
  away: {
    formation: "4-2-3-1",
    rows: [
      [{ n: 1, name: "Butez" }],
      [{ n: 18, name: "A. Moreno" }, { n: 4, name: "Kempf" }, { n: 5, name: "Goldaniga" }, { n: 2, name: "Van der Brempt" }],
      [{ n: 23, name: "Perrone" }, { n: 33, name: "Da Cunha" }],
      [{ n: 7, name: "Strefezza" }, { n: 79, name: "Nico Paz" }, { n: 11, name: "Fadera" }],
      [{ n: 10, name: "Cutrone" }],
    ],
    bench: [{ n: 9, name: "Douvikas" }, { n: 8, name: "Sergi Roberto" }, { n: 14, name: "Engelhardt" }, { n: 25, name: "Reina" }, { n: 3, name: "Valle" }],
  },
};

const EVENTS: Ev[] = [
  { min: "12'", kind: "goal", side: "home", player: "Lautaro", other: "Barella" },
  { min: "34'", kind: "goal", side: "away", player: "Nico Paz" },
  { min: "41'", kind: "yellow", side: "away", player: "Perrone" },
  { min: "58'", kind: "goal", side: "home", player: "Thuram", other: "Dimarco" },
  { min: "61'", kind: "sub", side: "home", player: "Frattesi", other: "Mkhitaryan" },
  { min: "64'", kind: "yellow", side: "home", player: "Bastoni" },
  { min: "66'", kind: "sub", side: "away", player: "Douvikas", other: "Cutrone" },
];

const STATS: { label: string; home: number; away: number; pct?: boolean }[] = [
  { label: "Possession", home: 58, away: 42, pct: true },
  { label: "Shots", home: 14, away: 9 },
  { label: "Shots on target", home: 6, away: 3 },
  { label: "Corners", home: 5, away: 2 },
  { label: "Fouls", home: 9, away: 12 },
  { label: "Offsides", home: 2, away: 1 },
];

type Result = "W" | "D" | "L";
type Row = { date: string; comp: string; opp: string; ha: "H" | "A"; score?: string; res?: Result; pens?: string };
const UPCOMING: Row[] = [
  { date: "Sat 14 Nov · 18:00", comp: "SA", opp: "Napoli", ha: "A" },
  { date: "Wed 25 Nov · 21:00", comp: "UCL", opp: "Arsenal", ha: "H" },
  { date: "Sun 29 Nov · 20:45", comp: "SA", opp: "Lazio", ha: "H" },
];
const RECENT: Row[] = [
  { date: "8 Nov", comp: "SA", opp: "Verona", ha: "H", score: "3–0", res: "W" },
  { date: "4 Nov", comp: "UCL", opp: "Kairat", ha: "A", score: "2–1", res: "W" },
  { date: "1 Nov", comp: "SA", opp: "Fiorentina", ha: "A", score: "1–1", res: "D" },
  { date: "28 Oct", comp: "SA", opp: "Atalanta", ha: "H", score: "0–1", res: "L" },
  { date: "25 Oct", comp: "SA", opp: "Roma", ha: "A", score: "2–2", res: "D" },
  { date: "21 Oct", comp: "UCL", opp: "Union SG", ha: "H", score: "4–0", res: "W" },
  { date: "18 Oct", comp: "SA", opp: "Juventus", ha: "H", score: "2–1", res: "W" },
  { date: "4 Oct", comp: "SA", opp: "Cremonese", ha: "A", score: "1–0", res: "W" },
  { date: "30 Sep", comp: "UCL", opp: "Slavia Praha", ha: "A", score: "3–0", res: "W" },
  { date: "27 Sep", comp: "SA", opp: "Cagliari", ha: "H", score: "2–0", res: "W" },
];

type Zone = { color: string; label: string };
const Z = {
  ucl: { color: "#2563eb", label: "Champions League" },
  uel: { color: "#f97316", label: "Europa League" },
  uecl: { color: "#16a34a", label: "Conference League" },
  rel: { color: "#dc2626", label: "Relegation" },
  r16: { color: "#16a34a", label: "Round of 16" },
  po: { color: "#ca8a04", label: "Knockout play-offs" },
} satisfies Record<string, Zone>;
type TableRow = { rank: number; team: string; short: string; p: number; gd: number; pts: number; zone?: Zone };

const SERIE_A_TEAMS = ["Napoli", "Inter", "AC Milan", "Roma", "Juventus", "Bologna", "Como", "Atalanta", "Lazio", "Udinese", "Cremonese", "Torino", "Sassuolo", "Cagliari", "Lecce", "Parma", "Genoa", "Fiorentina", "Verona", "Pisa"];
const SERIE_A: TableRow[] = SERIE_A_TEAMS.map((t, i) => ({
  rank: i + 1,
  team: t,
  short: t.replace("AC ", "").slice(0, 3).toUpperCase(),
  p: 11,
  gd: 14 - Math.round(i * 1.45),
  pts: 26 - i - (i > 3 ? 1 : 0) - (i > 10 ? 2 : 0),
  zone: i < 4 ? Z.ucl : i === 4 ? Z.uel : i === 5 ? Z.uecl : i >= 17 ? Z.rel : undefined,
}));
const UCL_TEAMS = ["Arsenal", "Bayern", "Real Madrid", "PSG", "Inter", "Liverpool", "Barcelona", "Man City", "Dortmund", "Chelsea", "Atlético", "Napoli", "Newcastle", "Leverkusen", "Sporting", "Juventus", "Tottenham", "Galatasaray", "Atalanta", "Marseille", "PSV", "Club Brugge", "Benfica", "Monaco", "Eintracht", "Villarreal", "Athletic", "Olympiacos", "Union SG", "Ajax", "Qarabağ", "Bodø/Glimt", "Copenhagen", "Pafos", "Slavia Praha", "Kairat"];
const UCL: TableRow[] = UCL_TEAMS.map((t, i) => ({
  rank: i + 1,
  team: t,
  short: t.slice(0, 3).toUpperCase(),
  p: 4,
  gd: 9 - Math.round(i * 0.5),
  pts: Math.max(0, 12 - Math.floor(i / 3)),
  zone: i < 8 ? Z.r16 : i < 24 ? Z.po : undefined,
}));
const PINNED_IN_CHAT = new Set(["Inter", "Napoli"]);

type PathStep = { round: string; opp?: string; ha?: "H" | "A"; score?: string; res?: Result; date?: string; note?: string };
const COPPA_PATH: PathStep[] = [
  { round: "Round of 16", opp: "Venezia", ha: "H", date: "Wed 3 Dec · 21:00" },
  { round: "Quarter-final", note: "Inter v winner of Fiorentina–Como" },
];
const UCL_KO_PATH: PathStep[] = [
  { round: "Round of 16 · 1st leg", opp: "Benfica", ha: "A", score: "1–1", res: "D", date: "10 Mar" },
  { round: "Round of 16 · 2nd leg", opp: "Benfica", ha: "H", score: "2–0", res: "W", date: "17 Mar" },
  { round: "Quarter-final · 1st leg", opp: "Bayern", ha: "A", date: "Tue 7 Apr · 21:00" },
];

const COMPS = [
  { key: "sa", name: "Serie A", short: "SA" },
  { key: "ucl", name: "Champions League", short: "UCL" },
  { key: "ci", name: "Coppa Italia", short: "CI" },
] as const;
type CompKey = (typeof COMPS)[number]["key"];

// ───────────────────────── in-memory store ─────────────────────────

type Tab = "match" | "matches" | "standings";
type DataState = "loaded" | "loading" | "none";
type Proto = {
  variant: string;
  open: boolean;
  tab: Tab;
  comp: CompKey;
  data: DataState;
  oldMatch: boolean; // 2015 summary: no places on the pitch
  uclKnockout: boolean; // February: league phase over
  side: Side; // variant B: which team is on the pitch
};
const KEYS = ["A", "B", "C"] as const;
const NAMES: Record<string, string> = { A: "One shared pitch, underline tabs", B: "One team at a time, pill tabs", C: "Landscape pitch + legend, bottom tabs" };
let state: Proto = { variant: readVariant(KEYS), open: true, tab: "match", comp: "sa", data: "loaded", oldMatch: false, uclKnockout: false, side: "home" };
const listeners = new Set<() => void>();
function set(patch: Partial<Proto>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function useProto() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

// ───────────────────────── shared bits ─────────────────────────

function Crest({ team, size = 28 }: { team: TeamInfo; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-[9px] font-black ring-1 ring-black/10"
      style={{ width: size, height: size, background: team.color, color: team.ink }}
    >
      {team.short}
    </span>
  );
}

/** Events that happened to one player, for the markers on the pitch. */
function marks(side: Side, name: string) {
  const goals = EVENTS.filter((e) => e.side === side && e.kind === "goal" && e.player === name).length;
  const yellow = EVENTS.some((e) => e.side === side && e.kind === "yellow" && e.player === name);
  const red = EVENTS.some((e) => e.side === side && e.kind === "red" && e.player === name);
  const off = EVENTS.find((e) => e.side === side && e.kind === "sub" && e.other === name);
  const on = EVENTS.find((e) => e.side === side && e.kind === "sub" && e.player === name);
  return { goals, yellow, red, off, on };
}

function MarkBadges({ side, name, compact }: { side: Side; name: string; compact?: boolean }) {
  const m = marks(side, name);
  return (
    <>
      {m.goals > 0 && <span className={cn("leading-none", compact ? "text-[9px]" : "text-[11px]")}>{"⚽".repeat(m.goals)}</span>}
      {m.yellow && <span className="inline-block h-2.5 w-[7px] rounded-[1px] bg-yellow-400" />}
      {m.red && <span className="inline-block h-2.5 w-[7px] rounded-[1px] bg-red-600" />}
      {m.off && <span className="text-[9px] font-bold leading-none text-red-500">↓{m.off.min}</span>}
    </>
  );
}

const EVENT_ICON: Record<EventKind, ReactNode> = {
  goal: <span>⚽</span>,
  yellow: <span className="inline-block h-3 w-2 rounded-[1px] bg-yellow-400" />,
  red: <span className="inline-block h-3 w-2 rounded-[1px] bg-red-600" />,
  sub: <span className="text-xs">🔁</span>,
};

function ResultBadge({ res }: { res: Result }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-black text-white",
        res === "W" && "bg-emerald-600",
        res === "D" && "bg-zinc-500",
        res === "L" && "bg-red-600",
      )}
    >
      {res}
    </span>
  );
}

function Skeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="space-y-2.5 py-2">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-app-field" style={{ width: `${90 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-10 text-center text-sm text-app-text-muted">{children}</p>;
}

/** Wraps a tab's body with the loading and no-data states from the controls. */
function Gate({ empty, children }: { empty: string; children: ReactNode }) {
  const s = useProto();
  if (s.data === "loading") return <Skeleton />;
  if (s.data === "none") return <Empty>{empty}</Empty>;
  return <>{children}</>;
}

function Header({ big }: { big?: boolean }) {
  return (
    <div className="pr-8">
      <p className="text-xs text-app-text-muted">Serie A · Stadio Giuseppe Meazza</p>
      <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex min-w-0 flex-col items-center gap-1">
          <Crest team={HOME} size={big ? 40 : 30} />
          <span className="truncate text-xs font-semibold text-app-text">{HOME.name}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className={cn("font-black text-app-text-strong tabular-nums", big ? "text-3xl" : "text-2xl")}>2–1</span>
          <span className="flex items-center gap-1.5 text-xs text-app-text-muted">
            <span className="size-2 animate-pulse rounded-full bg-red-500" /> 67'
          </span>
        </div>
        <div className="flex min-w-0 flex-col items-center gap-1">
          <Crest team={AWAY} size={big ? 40 : 30} />
          <span className="truncate text-xs font-semibold text-app-text">{AWAY.name}</span>
        </div>
      </div>
    </div>
  );
}

function CloseButton() {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={() => set({ open: false })}
      className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-lg text-app-text-muted hover:bg-app-field hover:text-app-text"
    >
      <X className="size-4" />
    </button>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-bold tracking-wider text-app-text-muted uppercase">{children}</h3>;
}

const PITCH_BG = "repeating-linear-gradient(0deg, #15803d 0 28px, #166534 28px 56px)";
const PITCH_BG_H = "repeating-linear-gradient(90deg, #15803d 0 28px, #166534 28px 56px)";

/** The lines of a vertical pitch (goal at the top and at the bottom). */
function PitchLinesV() {
  return (
    <div className="pointer-events-none absolute inset-2 rounded-sm border-2 border-white/45">
      <div className="absolute top-1/2 right-0 left-0 h-0 border-t-2 border-white/45" />
      <div className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/45" />
      <div className="absolute top-0 left-1/2 h-[14%] w-[48%] -translate-x-1/2 border-2 border-t-0 border-white/45" />
      <div className="absolute bottom-0 left-1/2 h-[14%] w-[48%] -translate-x-1/2 border-2 border-b-0 border-white/45" />
    </div>
  );
}

/** The fallback for a lineup without places (a summary from before about 2016): a plain list. */
function PlainLineups() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {(["home", "away"] as const).map((side) => (
        <div key={side}>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-app-text-strong">
            <Crest team={side === "home" ? HOME : AWAY} size={18} /> {LINEUPS[side].formation}
          </p>
          <ul className="space-y-1 text-[13px]">
            {LINEUPS[side].rows.flat().map((p) => (
              <li key={p.n} className="flex gap-2">
                <span className="w-5 text-right text-xs text-app-text-muted tabular-nums">{p.n}</span>
                <span className="text-app-text">{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="col-span-2 text-xs text-app-text-muted">No positions for this match: ESPN has the lineups only as a list.</p>
    </div>
  );
}

function StatBars() {
  return (
    <div className="space-y-2.5">
      {STATS.map((s) => {
        const total = s.home + s.away || 1;
        return (
          <div key={s.label}>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-bold text-app-text-strong tabular-nums">{s.home}{s.pct && "%"}</span>
              <span className="text-xs text-app-text-muted">{s.label}</span>
              <span className="font-bold text-app-text-strong tabular-nums">{s.away}{s.pct && "%"}</span>
            </div>
            <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              <div className="rounded-l-full" style={{ width: `${(s.home / total) * 100}%`, background: HOME.color }} />
              <div className="flex-1 rounded-r-full bg-app-text-dim/50" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompSelect({ style }: { style: "select" | "chips" | "segmented" }) {
  const s = useProto();
  if (style === "select")
    return (
      <label className="relative mb-3 flex items-center">
        <select
          value={s.comp}
          onChange={(e) => set({ comp: e.target.value as CompKey })}
          className="w-full appearance-none rounded-lg border border-app-border bg-app-field py-2 pr-8 pl-3 text-sm font-semibold text-app-text-strong"
        >
          {COMPS.map((c) => (
            <option key={c.key} value={c.key}>{c.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-app-text-muted" />
      </label>
    );
  if (style === "chips")
    return (
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {COMPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => set({ comp: c.key })}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
              s.comp === c.key ? "border-app-accent bg-app-accent-soft text-app-accent-text" : "border-app-border text-app-text-muted hover:text-app-text",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
    );
  return (
    <div className="mb-3 grid grid-cols-3 rounded-lg bg-app-field p-0.5">
      {COMPS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => set({ comp: c.key })}
          className={cn("rounded-md py-1.5 text-xs font-bold", s.comp === c.key ? "bg-app-panel text-app-text-strong shadow-sm" : "text-app-text-muted")}
        >
          {c.short}
        </button>
      ))}
    </div>
  );
}

function StandingsTable({ rows, dense }: { rows: TableRow[]; dense?: boolean }) {
  const zones = [...new Map(rows.filter((r) => r.zone).map((r) => [r.zone!.label, r.zone!])).values()];
  return (
    <div>
      <table className="w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-[11px] text-app-text-muted">
            <th className="w-7 pb-1.5 text-right font-semibold">#</th>
            <th className="pb-1.5 pl-3 text-left font-semibold">Team</th>
            <th className="w-8 pb-1.5 text-right font-semibold">P</th>
            <th className="w-10 pb-1.5 text-right font-semibold">GD</th>
            <th className="w-10 pb-1.5 pr-1 text-right font-semibold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const me = r.team === "Inter";
            const pinned = PINNED_IN_CHAT.has(r.team);
            return (
              <tr key={r.team} className={cn(me && "bg-app-accent-soft font-bold", !me && "border-t border-app-border/60")}>
                <td className={cn("relative pr-1 text-right text-app-text-muted", dense ? "py-1" : "py-1.5")}>
                  {r.zone && <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full" style={{ background: r.zone.color }} />}
                  {r.rank}
                </td>
                <td className="pl-3">
                  <span className="flex items-center gap-1.5 text-app-text-strong">
                    {r.team}
                    {pinned && <Pin className="size-3 text-app-accent-text" />}
                  </span>
                </td>
                <td className="text-right text-app-text-muted">{r.p}</td>
                <td className="text-right text-app-text-muted">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                <td className="pr-1 text-right font-bold text-app-text-strong">{r.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {zones.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-app-text-muted">
          {zones.map((z) => (
            <span key={z.label} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: z.color }} /> {z.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PathList({ steps }: { steps: PathStep[] }) {
  return (
    <ol className="relative ml-2 space-y-3 border-l-2 border-app-border pl-4">
      {steps.map((st) => (
        <li key={st.round} className="relative">
          <span className={cn("absolute top-1 -left-[23px] size-3 rounded-full border-2 border-app-panel", st.res ? "bg-app-accent" : "bg-app-text-dim")} />
          <p className="text-[11px] font-semibold text-app-text-muted uppercase">{st.round}</p>
          {st.opp ? (
            <p className="flex items-center gap-2 text-[13px] text-app-text-strong">
              <span className="text-xs text-app-text-muted">{st.ha === "H" ? "vs" : "at"}</span> {st.opp}
              {st.score ? <span className="ml-auto flex items-center gap-1.5 font-bold tabular-nums">{st.score} {st.res && <ResultBadge res={st.res} />}</span> : <span className="ml-auto text-xs text-app-text-muted">{st.date}</span>}
            </p>
          ) : (
            <p className="text-[13px] text-app-text-muted">{st.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function StandingsBody({ dense }: { dense?: boolean }) {
  const s = useProto();
  if (s.comp === "ci")
    return (
      <>
        <p className="mb-3 text-xs text-app-text-muted">Coppa Italia has no table. Inter's path:</p>
        <PathList steps={COPPA_PATH} />
      </>
    );
  if (s.comp === "ucl" && s.uclKnockout)
    return (
      <>
        <SectionTitle>Knockout rounds</SectionTitle>
        <PathList steps={UCL_KO_PATH} />
        <div className="mt-5">
          <SectionTitle>League phase · final</SectionTitle>
          <StandingsTable rows={UCL} dense />
        </div>
      </>
    );
  return <StandingsTable rows={s.comp === "sa" ? SERIE_A : UCL} dense={dense} />;
}

// ───────────────────────── variant A: one shared pitch ─────────────────────────

function MarkerA({ side, p }: { side: Side; p: Player }) {
  const team = side === "home" ? HOME : AWAY;
  return (
    <div className="flex w-14 flex-col items-center">
      <div className="relative">
        <span className="flex size-7 items-center justify-center rounded-full text-[11px] font-black shadow ring-2 ring-white/80" style={{ background: team.color, color: team.ink }}>
          {p.n}
        </span>
        <span className="absolute -top-1.5 -right-3 flex items-center gap-0.5">
          <MarkBadges side={side} name={p.name} compact />
        </span>
      </div>
      <span className="mt-0.5 max-w-full truncate rounded bg-black/35 px-1 text-[10px] font-semibold text-white">{p.name}</span>
    </div>
  );
}

function SharedPitch() {
  // Away attacks downwards (top half, mirrored left/right); home attacks upwards (bottom half).
  const away = LINEUPS.away.rows.map((r) => [...r].reverse());
  const home = [...LINEUPS.home.rows].reverse();
  return (
    <div className="relative overflow-hidden rounded-lg" style={{ background: PITCH_BG }}>
      <PitchLinesV />
      <div className="relative flex flex-col gap-1.5 px-1 py-3">
        <p className="text-center text-[10px] font-bold text-white/80">{AWAY.name} · {LINEUPS.away.formation}</p>
        {away.map((row, i) => (
          <div key={`a${i}`} className="flex justify-around">{row.map((p) => <MarkerA key={p.n} side="away" p={p} />)}</div>
        ))}
        <div className="h-3" />
        {home.map((row, i) => (
          <div key={`h${i}`} className="flex justify-around">{row.map((p) => <MarkerA key={p.n} side="home" p={p} />)}</div>
        ))}
        <p className="text-center text-[10px] font-bold text-white/80">{HOME.name} · {LINEUPS.home.formation}</p>
      </div>
    </div>
  );
}

function BenchColumns() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {(["home", "away"] as const).map((side) => (
        <ul key={side} className="space-y-1 text-[13px]">
          {LINEUPS[side].bench.map((p) => {
            const m = marks(side, p.name);
            return (
              <li key={p.n} className="flex items-baseline gap-2">
                <span className="w-5 text-right text-xs text-app-text-muted tabular-nums">{p.n}</span>
                <span className={cn("min-w-0", m.on ? "font-semibold text-app-text-strong" : "text-app-text-soft")}>
                  {p.name}
                  {m.on && <span className="block text-[11px] font-normal text-emerald-500">↑ {m.on.min} for {m.on.other}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}

function EventListA() {
  return (
    <ul className="space-y-1.5">
      {EVENTS.map((e) => (
        <li key={e.min + e.player} className={cn("flex items-center gap-2 text-[13px]", e.side === "away" && "flex-row-reverse text-right")}>
          <span className="w-8 shrink-0 text-xs text-app-text-muted tabular-nums">{e.min}</span>
          {EVENT_ICON[e.kind]}
          <span className="min-w-0">
            <span className="font-semibold text-app-text-strong">{e.player}</span>
            {e.other && <span className="block text-xs text-app-text-muted">{e.kind === "sub" ? `for ${e.other}` : `assist ${e.other}`}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MatchesTableA() {
  const row = (r: Row, i: number) => (
    <li key={i} className="flex items-center gap-2 border-t border-app-border/60 py-2 text-[13px] first:border-t-0">
      <span className="w-14 shrink-0 text-xs text-app-text-muted">{r.date.split(" · ")[0]}</span>
      <span className="w-9 shrink-0 rounded bg-app-field px-1 text-center text-[10px] font-bold text-app-text-muted">{r.comp}</span>
      <span className="w-4 shrink-0 text-[11px] text-app-text-muted">{r.ha}</span>
      <span className="min-w-0 flex-1 truncate text-app-text-strong">{r.opp}</span>
      {r.score ? <span className="font-bold text-app-text-strong tabular-nums">{r.score}</span> : <span className="text-xs text-app-text-muted">{r.date.split(" · ")[1]}</span>}
      {r.res && <ResultBadge res={r.res} />}
    </li>
  );
  return (
    <>
      <SectionTitle>Next</SectionTitle>
      <ul className="mb-5">{UPCOMING.map(row)}</ul>
      <SectionTitle>Recent</SectionTitle>
      <ul>{RECENT.map(row)}</ul>
    </>
  );
}

function VariantA() {
  const s = useProto();
  const tabs: [Tab, string][] = [["match", "Match"], ["matches", "Matches"], ["standings", "Standings"]];
  return (
    <>
      <header className="relative shrink-0 px-5 pt-4">
        <CloseButton />
        <Header />
        <nav className="mt-3 -mx-5 flex border-b border-app-border px-3">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ tab: k })}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold",
                s.tab === k ? "border-app-accent text-app-text-strong" : "border-transparent text-app-text-muted hover:text-app-text",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {s.tab === "match" && (
          <Gate empty="Lineups are usually out about an hour before kick-off.">
            <section>
              <SectionTitle>Lineups</SectionTitle>
              {s.oldMatch ? <PlainLineups /> : <SharedPitch />}
            </section>
            <section>
              <SectionTitle>Bench</SectionTitle>
              <BenchColumns />
            </section>
            <section>
              <SectionTitle>Events</SectionTitle>
              <EventListA />
            </section>
            <section>
              <SectionTitle>Stats</SectionTitle>
              <StatBars />
            </section>
          </Gate>
        )}
        {s.tab === "matches" && (
          <Gate empty="No matches found for Inter.">
            <MatchesTableA />
          </Gate>
        )}
        {s.tab === "standings" && (
          <Gate empty="No table yet for this competition.">
            <CompSelect style="select" />
            <StandingsBody />
          </Gate>
        )}
      </div>
    </>
  );
}

// ───────────────────────── variant B: one team at a time ─────────────────────────

function MarkerB({ side, p }: { side: Side; p: Player }) {
  const team = side === "home" ? HOME : AWAY;
  return (
    <div className="flex w-[68px] flex-col items-center">
      <div className="relative">
        <Shirt className="size-9 drop-shadow" fill={team.color} stroke={side === "home" ? "#ffffff" : "#334155"} strokeWidth={1.2} />
        <span className="absolute inset-0 flex items-center justify-center pt-1 text-[11px] font-black" style={{ color: team.ink }}>
          {p.n}
        </span>
      </div>
      <span className="max-w-full truncate text-[11px] font-bold text-white drop-shadow">{p.name}</span>
      <span className="flex h-3 items-center gap-0.5">
        <MarkBadges side={side} name={p.name} />
      </span>
    </div>
  );
}

function SingleTeamPitch() {
  const s = useProto();
  const rows = [...LINEUPS[s.side].rows].reverse();
  return (
    <>
      <div className="mb-2 grid grid-cols-2 rounded-lg bg-app-field p-0.5">
        {(["home", "away"] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => set({ side })}
            className={cn("flex items-center justify-center gap-2 rounded-md py-1.5 text-xs font-bold", s.side === side ? "bg-app-panel text-app-text-strong shadow-sm" : "text-app-text-muted")}
          >
            <Crest team={side === "home" ? HOME : AWAY} size={18} /> {(side === "home" ? HOME : AWAY).name} · {LINEUPS[side].formation}
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-lg" style={{ background: PITCH_BG }}>
        <PitchLinesV />
        <div className="relative flex min-h-[380px] flex-col justify-around px-1 py-4">
          {rows.map((row, i) => (
            <div key={i} className="flex justify-around">{row.map((p) => <MarkerB key={p.n} side={s.side} p={p} />)}</div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {LINEUPS[s.side].bench.map((p) => {
          const m = marks(s.side, p.name);
          return (
            <span key={p.n} className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", m.on ? "border-emerald-500/60 text-app-text-strong" : "border-app-border text-app-text-muted")}>
              <span className="tabular-nums">{p.n}</span> {p.name}
              {m.on && <span className="text-emerald-500">↑{m.on.min}</span>}
            </span>
          );
        })}
      </div>
    </>
  );
}

function TimelineB() {
  return (
    <ol className="relative">
      <span className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-app-border" />
      {EVENTS.map((e) => (
        <li key={e.min + e.player} className="relative grid grid-cols-[1fr_44px_1fr] items-center py-1.5 text-[13px]">
          <span className={cn("min-w-0 pr-2 text-right", e.side !== "home" && "invisible")}>
            <span className="font-semibold text-app-text-strong">{e.player}</span>
            {e.other && <span className="block text-[11px] text-app-text-muted">{e.kind === "sub" ? `for ${e.other}` : `assist ${e.other}`}</span>}
          </span>
          <span className="relative z-10 mx-auto flex flex-col items-center rounded-full bg-app-panel px-1">
            {EVENT_ICON[e.kind]}
            <span className="text-[10px] text-app-text-muted tabular-nums">{e.min}</span>
          </span>
          <span className={cn("min-w-0 pl-2", e.side !== "away" && "invisible")}>
            <span className="font-semibold text-app-text-strong">{e.player}</span>
            {e.other && <span className="block text-[11px] text-app-text-muted">{e.kind === "sub" ? `for ${e.other}` : `assist ${e.other}`}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StatGridB() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {STATS.map((s) => {
        const total = s.home + s.away || 1;
        return (
          <div key={s.label} className="rounded-lg border border-app-border p-2">
            <p className="text-[11px] text-app-text-muted">{s.label}</p>
            <p className="flex items-baseline justify-between text-base font-black text-app-text-strong tabular-nums">
              <span>{s.home}{s.pct && "%"}</span>
              <span className="text-app-text-muted">{s.away}{s.pct && "%"}</span>
            </p>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-app-text-dim/40">
              <div className="h-full" style={{ width: `${(s.home / total) * 100}%`, background: HOME.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchCardsB() {
  const card = (r: Row, i: number) => (
    <li
      key={i}
      className="flex items-center gap-3 rounded-lg border border-app-border border-l-4 bg-app-bg/40 px-3 py-2"
      style={{ borderLeftColor: r.res === "W" ? "#059669" : r.res === "D" ? "#71717a" : r.res === "L" ? "#dc2626" : "var(--app-border)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-app-text-muted">{r.comp} · {r.date}</p>
        <p className="truncate text-[13px] font-semibold text-app-text-strong">
          {r.ha === "H" ? `Inter v ${r.opp}` : `${r.opp} v Inter`}
        </p>
      </div>
      {r.score && <span className="text-base font-black text-app-text-strong tabular-nums">{r.score}</span>}
    </li>
  );
  return (
    <>
      <SectionTitle>Next</SectionTitle>
      <ul className="mb-5 space-y-1.5">{UPCOMING.map(card)}</ul>
      <SectionTitle>Recent</SectionTitle>
      <ul className="space-y-1.5">{RECENT.map(card)}</ul>
    </>
  );
}

function VariantB() {
  const s = useProto();
  const tabs: [Tab, string][] = [["match", "Match"], ["matches", "Matches"], ["standings", "Standings"]];
  return (
    <>
      <header className="relative shrink-0 border-b border-app-border px-5 pt-4 pb-3">
        <CloseButton />
        <Header big />
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-app-field p-1">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ tab: k })}
              className={cn("rounded-full py-1.5 text-xs font-bold", s.tab === k ? "bg-app-accent text-app-accent-fg" : "text-app-text-muted hover:text-app-text")}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {s.tab === "match" && (
          <Gate empty="Lineups are usually out about an hour before kick-off.">
            <section>{s.oldMatch ? <PlainLineups /> : <SingleTeamPitch />}</section>
            <section>
              <SectionTitle>Events</SectionTitle>
              <TimelineB />
            </section>
            <section>
              <SectionTitle>Stats</SectionTitle>
              <StatGridB />
            </section>
          </Gate>
        )}
        {s.tab === "matches" && (
          <Gate empty="No matches found for Inter.">
            <MatchCardsB />
          </Gate>
        )}
        {s.tab === "standings" && (
          <Gate empty="No table yet for this competition.">
            <CompSelect style="chips" />
            <StandingsBody />
          </Gate>
        )}
      </div>
    </>
  );
}

// ───────────────────────── variant C: landscape pitch + legend ─────────────────────────

function LandscapePitch() {
  // Home attacks right (rows from the left edge), away attacks left (rows from the right edge).
  // Columns run top-to-bottom = team's left-to-right for home; mirrored for away.
  const col = (side: Side, row: Player[], i: number) => (
    <div key={`${side}${i}`} className="flex flex-col justify-around">
      {(side === "home" ? row : [...row].reverse()).map((p) => {
        const team = side === "home" ? HOME : AWAY;
        const m = marks(side, p.name);
        return (
          <span key={p.n} className="relative flex size-6 items-center justify-center rounded-full text-[10px] font-black shadow ring-1 ring-white/80" style={{ background: team.color, color: team.ink }}>
            {p.n}
            {m.goals > 0 && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-white ring-1 ring-black/30" />}
            {(m.yellow || m.red) && <span className={cn("absolute -bottom-1 -right-0.5 h-2 w-1.5 rounded-[1px]", m.red ? "bg-red-600" : "bg-yellow-400")} />}
            {m.off && <span className="absolute -bottom-1 -left-1 text-[8px] font-black text-red-300">↓</span>}
          </span>
        );
      })}
    </div>
  );
  return (
    <div className="relative h-[210px] overflow-hidden rounded-lg" style={{ background: PITCH_BG_H }}>
      <div className="pointer-events-none absolute inset-2 rounded-sm border-2 border-white/45">
        <div className="absolute top-0 bottom-0 left-1/2 border-l-2 border-white/45" />
        <div className="absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/45" />
        <div className="absolute top-1/2 left-0 h-[48%] w-[13%] -translate-y-1/2 border-2 border-l-0 border-white/45" />
        <div className="absolute top-1/2 right-0 h-[48%] w-[13%] -translate-y-1/2 border-2 border-r-0 border-white/45" />
      </div>
      <div className="relative flex h-full px-2 py-3">
        <div className="flex flex-1 justify-around">{LINEUPS.home.rows.map((r, i) => col("home", r, i))}</div>
        <div className="flex flex-1 flex-row-reverse justify-around">{LINEUPS.away.rows.map((r, i) => col("away", r, i))}</div>
      </div>
    </div>
  );
}

function LegendC() {
  return (
    <div className="grid grid-cols-2 gap-x-4">
      {(["home", "away"] as const).map((side) => (
        <div key={side} className="min-w-0">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-app-text-strong">
            <Crest team={side === "home" ? HOME : AWAY} size={16} /> {LINEUPS[side].formation}
          </p>
          <ul className="text-[12px]">
            {LINEUPS[side].rows.flat().map((p) => (
              <li key={p.n} className="flex items-center gap-1.5 py-[1px]">
                <span className="w-5 text-right text-[11px] text-app-text-muted tabular-nums">{p.n}</span>
                <span className="truncate text-app-text">{p.name}</span>
                <MarkBadges side={side} name={p.name} compact />
              </li>
            ))}
          </ul>
          <p className="mt-1.5 mb-0.5 text-[10px] font-bold tracking-wider text-app-text-muted uppercase">Bench</p>
          <ul className="text-[12px]">
            {LINEUPS[side].bench.map((p) => {
              const m = marks(side, p.name);
              return (
                <li key={p.n} className="flex items-center gap-1.5 py-[1px]">
                  <span className="w-5 text-right text-[11px] text-app-text-muted tabular-nums">{p.n}</span>
                  <span className={cn("truncate", m.on ? "text-app-text" : "text-app-text-muted")}>{p.name}</span>
                  {m.on && <span className="text-[10px] font-bold text-emerald-500">↑{m.on.min}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EventsByHalfC() {
  const halves = [
    { title: "1st half", evs: EVENTS.filter((e) => parseInt(e.min) <= 45) },
    { title: "2nd half", evs: EVENTS.filter((e) => parseInt(e.min) > 45) },
  ];
  return (
    <div className="space-y-3">
      {halves.map((h) => (
        <div key={h.title}>
          <p className="mb-1 text-[11px] font-semibold text-app-text-muted">{h.title}</p>
          <div className="flex flex-wrap gap-1.5">
            {h.evs.map((e) => (
              <span key={e.min + e.player} className="flex items-center gap-1.5 rounded-md bg-app-field px-2 py-1 text-[12px]">
                <span className="text-[11px] text-app-text-muted tabular-nums">{e.min}</span>
                {EVENT_ICON[e.kind]}
                <span className="font-semibold text-app-text-strong">{e.player}</span>
                <Crest team={e.side === "home" ? HOME : AWAY} size={12} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatTableC() {
  return (
    <table className="w-full text-[13px] tabular-nums">
      <tbody>
        {STATS.map((s) => (
          <tr key={s.label} className="border-t border-app-border/60 first:border-t-0">
            <td className={cn("w-12 py-1.5 font-bold", s.home > s.away ? "text-app-text-strong" : "text-app-text-muted")}>{s.home}{s.pct && "%"}</td>
            <td className="text-center text-xs text-app-text-muted">{s.label}</td>
            <td className={cn("w-12 text-right font-bold", s.away > s.home ? "text-app-text-strong" : "text-app-text-muted")}>{s.away}{s.pct && "%"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatchesDenseC() {
  return (
    <>
      <div className="mb-4 flex items-center gap-1">
        <span className="mr-1 text-[11px] font-semibold text-app-text-muted">Form</span>
        {RECENT.slice(0, 5).map((r, i) => r.res && <ResultBadge key={i} res={r.res} />)}
      </div>
      <SectionTitle>Next</SectionTitle>
      <ul className="mb-4 text-[12px]">
        {UPCOMING.map((r, i) => (
          <li key={i} className="flex gap-2 py-1">
            <span className="w-24 shrink-0 text-app-text-muted">{r.date.split(" · ")[0]}</span>
            <span className="flex-1 truncate text-app-text">{r.ha === "H" ? "vs" : "at"} {r.opp}</span>
            <span className="text-app-text-muted">{r.comp}</span>
          </li>
        ))}
      </ul>
      <SectionTitle>Recent</SectionTitle>
      <ul className="text-[12px]">
        {RECENT.map((r, i) => (
          <li key={i} className="flex items-center gap-2 py-1">
            <span className="w-24 shrink-0 text-app-text-muted">{r.date}</span>
            <span className="flex-1 truncate text-app-text">{r.ha === "H" ? "vs" : "at"} {r.opp}</span>
            <span className="text-app-text-muted">{r.comp}</span>
            <span className={cn("w-9 text-right font-bold tabular-nums", r.res === "W" ? "text-emerald-500" : r.res === "L" ? "text-red-500" : "text-app-text-soft")}>{r.score}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function VariantC() {
  const s = useProto();
  const tabs: [Tab, string, ReactNode][] = [
    ["match", "Match", <span className="text-base leading-none">⚽</span>],
    ["matches", "Matches", <ListOrdered className="size-4" />],
    ["standings", "Standings", <Trophy className="size-4" />],
  ];
  return (
    <>
      <header className="relative shrink-0 border-b border-app-border bg-app-bg/40 px-5 pt-4 pb-4">
        <CloseButton />
        <Header />
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {s.tab === "match" && (
          <Gate empty="Lineups are usually out about an hour before kick-off.">
            <section>
              {s.oldMatch ? <PlainLineups /> : (
                <>
                  <LandscapePitch />
                  <div className="mt-3">
                    <LegendC />
                  </div>
                </>
              )}
            </section>
            <section>
              <SectionTitle>Events</SectionTitle>
              <EventsByHalfC />
            </section>
            <section>
              <SectionTitle>Stats</SectionTitle>
              <StatTableC />
            </section>
          </Gate>
        )}
        {s.tab === "matches" && (
          <Gate empty="No matches found for Inter.">
            <MatchesDenseC />
          </Gate>
        )}
        {s.tab === "standings" && (
          <Gate empty="No table yet for this competition.">
            <CompSelect style="segmented" />
            <StandingsBody dense />
          </Gate>
        )}
      </div>
      <nav className="grid shrink-0 grid-cols-3 border-t border-app-border">
        {tabs.map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => set({ tab: k })}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", s.tab === k ? "text-app-accent-text" : "text-app-text-muted hover:text-app-text")}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}

// ───────────────────────── mount: drawer beside the chat + controls ─────────────────────────

/** Rendered as the chat column's sibling, so the chat narrows while it is open. */
export function MatchDrawerPrototype() {
  const s = useProto();
  const { definition, setMode } = useTheme();
  const onVariant = (v: string) => {
    writeVariant(v);
    set({ variant: v });
  };
  useVariantParam(KEYS, s.variant, onVariant);
  const toggle = (label: string, on: boolean, patch: Partial<Proto>, off: Partial<Proto>) => (
    <button type="button" onClick={() => set(on ? off : patch)} className={cn("rounded px-1.5 py-0.5", on ? "bg-yellow-400 font-bold text-black" : "bg-white/15 hover:bg-white/25")}>
      {label}
    </button>
  );
  return (
    <>
      {s.open && (
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-app-border-strong bg-app-panel" data-testid="match-drawer-prototype">
          {s.variant === "A" && <VariantA />}
          {s.variant === "B" && <VariantB />}
          {s.variant === "C" && <VariantC />}
        </aside>
      )}
      <PrototypeSwitcher keys={KEYS} names={NAMES} current={s.variant} onChange={onVariant}>
        <div className="flex flex-wrap items-center justify-center gap-1 text-[11px]">
          {toggle(s.open ? "Drawer open" : "Drawer closed", s.open, { open: true }, { open: false })}
          {(["loaded", "loading", "none"] as const).map((d) => (
            <button key={d} type="button" onClick={() => set({ data: d })} className={cn("rounded px-1.5 py-0.5", s.data === d ? "bg-yellow-400 font-bold text-black" : "bg-white/15 hover:bg-white/25")}>
              {d === "none" ? "No data" : d === "loading" ? "Loading" : "Loaded"}
            </button>
          ))}
          {toggle("2015 match (no places)", s.oldMatch, { oldMatch: true }, { oldMatch: false })}
          {toggle("UCL in knockouts", s.uclKnockout, { uclKnockout: true }, { uclKnockout: false })}
          <button
            type="button"
            onClick={() => setMode(definition.mode === "dark" ? "light" : "dark")}
            className="rounded bg-white/15 px-1.5 py-0.5 hover:bg-white/25"
          >
            Theme: {definition.mode === "dark" ? "dark → light" : "light → dark"}
          </button>
        </div>
      </PrototypeSwitcher>
    </>
  );
}

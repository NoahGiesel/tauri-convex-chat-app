import type { Doc } from "../../convex/_generated/dataModel";

type Lineups = Doc<"footballMatchDetails">["lineups"];
type Events = Doc<"footballMatchDetails">["events"];
export type SideKey = "home" | "away";

/** Un giocatore come lo disegna il campo: il numero, il nome corto e l'id che lo lega agli eventi. */
export type PitchMarker = {
  athleteId?: string;
  name: string;
  shortName: string;
  jersey?: string;
};

/** Una squadra sul campo: la formazione, il colore della maglia e le righe dal fondo (portiere) all'attacco. */
export type PitchSide = { formation?: string; color?: string; rows: PitchMarker[][] };
/** Le due squadre sullo stesso campo verticale: la trasferta in alto, la casa in basso. */
export type PitchView = { home: PitchSide; away: PitchSide };

function rowsOf(lineup: Lineups[number]): PitchMarker[][] | null {
  if (lineup.starters.length === 0) return null;
  const byRow = new Map<number, { order: number; marker: PitchMarker }[]>();
  for (const p of lineup.starters) {
    // Un titolare senza posto (il riassunto 2015, o una riga vecchia) non si può disegnare.
    if (p.row === undefined || p.order === undefined) return null;
    const marker: PitchMarker = {
      name: p.name,
      shortName: p.shortName ?? p.name,
      ...(p.jersey ? { jersey: p.jersey } : {}),
      ...(p.athleteId ? { athleteId: p.athleteId } : {}),
    };
    byRow.set(p.row, [...(byRow.get(p.row) ?? []), { order: p.order, marker }]);
  }
  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, players]) => players.sort((a, b) => a.order - b.order).map((p) => p.marker));
}

/**
 * Le due formazioni su un solo campo. Le righe sono quelle salvate dal parser, dal portiere in su;
 * la trasferta ha le righe e la sinistra e la destra scambiate, perché attacca verso il basso
 * (docs/MATCH-DRAWER-SPEC.md, Match tab). `null` quando una delle due non ha i posti: lì restano le liste.
 */
export function pitchView(lineups: Lineups): PitchView | null {
  const home = lineups.find((l) => l.side === "home");
  const away = lineups.find((l) => l.side === "away");
  if (!home || !away) return null;
  const homeRows = rowsOf(home);
  const awayRows = rowsOf(away);
  if (!homeRows || !awayRows) return null;
  return {
    home: { formation: home.formation, color: home.color, rows: homeRows },
    away: { formation: away.formation, color: away.color, rows: awayRows.map((row) => [...row].reverse()) },
  };
}

/** Il colore del numero sulla maglia: scuro sui colori chiari, bianco sugli altri. */
export function readableInk(color?: string): string {
  const hex = color?.replace(/^#+/, "");
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.179 ? "#111827" : "#ffffff";
}

/** I distintivi di un giocatore: gol, cartellini, il minuto in cui esce e chi entra al suo posto. */
export type PlayerMarks = {
  goals: number;
  yellow: boolean;
  red: boolean;
  /** Il minuto in cui il titolare è uscito. */
  off?: string;
  /** Il minuto in cui è entrato, con chi ha sostituito. */
  on?: { minute: string; other?: string };
};

/**
 * Gli eventi di un giocatore, agganciati per id ESPN e non per nome. Gli autogol restano fuori:
 * ESPN li mette dalla parte della squadra che ne beneficia, non del giocatore che li segna.
 */
export function playerMarks(events: Events, side: SideKey, athleteId?: string): PlayerMarks {
  const marks: PlayerMarks = { goals: 0, yellow: false, red: false };
  if (!athleteId) return marks;
  for (const e of events) {
    if (e.side !== side) continue;
    if (e.playerId === athleteId) {
      if (e.kind === "goal" || e.kind === "penaltyGoal") marks.goals += 1;
      if (e.kind === "yellowCard") marks.yellow = true;
      if (e.kind === "redCard") marks.red = true;
      if (e.kind === "substitution") marks.on = e.other ? { minute: e.minute, other: e.other } : { minute: e.minute };
    }
    if (e.kind === "substitution" && e.otherId === athleteId) marks.off = e.minute;
  }
  return marks;
}

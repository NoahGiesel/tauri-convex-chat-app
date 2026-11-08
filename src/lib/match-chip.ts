import type { TeamPin } from "./team-pins";

/** Una partita come la manda `teamPins.list`. */
export type PinMatch = NonNullable<TeamPin["nextMatch"]>;
type Score = { home: number; away: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Dal momento in cui la prossima partita è a meno di 60 minuti, il chip lascia la partita finita e mostra quella. */
const NEXT_TAKES_OVER_MS = 60 * MINUTE;
/** Una partita rinviata o annullata resta nel chip fino a 3 ore dopo il calcio d'inizio previsto. */
const CALLED_OFF_SHOWN_MS = 3 * HOUR;
/** Senza aggiornamenti da più di 2 minuti (in corso) o 12 ore (in programma), il dato è vecchio. */
const LIVE_STALE_MS = 2 * MINUTE;
const NEXT_STALE_MS = 12 * HOUR;

/** Cosa mostra il chip (docs/TEAM-PINS-SPEC.md, Chip states). Le etichette nascono dal nome ESPN dello stato. */
export type ChipState =
  | { kind: "next"; kickoff: number }
  | { kind: "delayed"; kickoff: number }
  | { kind: "live"; score: Score; minute: string | null }
  | { kind: "halftime"; score: Score }
  | { kind: "shootout"; score: Score; shootout: Score }
  | { kind: "finished"; score: Score; ending: "ft" | "aet" | "pens"; shootout: Score | null; winner: "home" | "away" | null }
  | { kind: "suspended"; score: Score }
  | { kind: "abandoned"; score: Score }
  | { kind: "postponed"; kickoff: number }
  | { kind: "cancelled"; kickoff: number };


function winnerOf(score: Score): "home" | "away" | null {
  return score.home > score.away ? "home" : score.away > score.home ? "away" : null;
}

/** Lo stato del chip per una partita. `pre` e `in` decidono la fase; il nome ESPN decide l'etichetta. */
export function chipState(m: PinMatch): ChipState {
  const name = m.statusName;
  const score = m.score ?? { home: 0, away: 0 };
  if (/POSTPONED/.test(name)) return { kind: "postponed", kickoff: m.kickoff };
  if (/CANCEL/.test(name)) return { kind: "cancelled", kickoff: m.kickoff };
  if (m.state === "pre") return /DELAYED/.test(name) ? { kind: "delayed", kickoff: m.kickoff } : { kind: "next", kickoff: m.kickoff };
  if (/SUSPENDED/.test(name)) return { kind: "suspended", score };
  if (/ABANDONED/.test(name)) return { kind: "abandoned", score };
  if (m.state === "in") {
    if (/HALFTIME/.test(name)) return { kind: "halftime", score };
    if (/SHOOTOUT/.test(name) || m.shootout) return { kind: "shootout", score, shootout: m.shootout ?? { home: 0, away: 0 } };
    return { kind: "live", score, minute: m.clock };
  }
  if (/PEN/.test(name) || m.shootout) {
    const shootout = m.shootout ?? { home: 0, away: 0 };
    return { kind: "finished", score, ending: "pens", shootout, winner: winnerOf(shootout) };
  }
  return { kind: "finished", score, ending: /AET/.test(name) ? "aet" : "ft", shootout: null, winner: winnerOf(score) };
}

/** Più o meno quando finisce una partita: serve a trovare la mattina dopo. */
const MATCH_LENGTH_MS = 2 * HOUR;

/** Le prime 6 del mattino (ora locale) dopo la fine della partita: la mattina dopo, anche per una partita dopo mezzanotte. */
function sixNextMorning(kickoff: number): number {
  const end = kickoff + MATCH_LENGTH_MS;
  const d = new Date(end);
  d.setHours(6, 0, 0, 0);
  if (d.getTime() <= end) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Una partita già chiusa resta nel chip: le rinviate fino a 3 ore dopo il calcio d'inizio, le altre fino alle 6 del giorno dopo. */
function stillShown(m: PinMatch, now: number): boolean {
  const kind = chipState(m).kind;
  const calledOff = kind === "postponed" || kind === "cancelled";
  return now < (calledOff ? m.kickoff + CALLED_OFF_SHOWN_MS : sixNextMorning(m.kickoff));
}

/**
 * La partita che il chip di una squadra mostra adesso: la prossima se è in corso o a meno di 60 minuti,
 * altrimenti l'ultima finché resta (fino alle 6 o, se rinviata, fino a 3 ore dopo), altrimenti la prossima.
 * `null`: nessuna partita in programma.
 */
export function shownMatch(pin: Pick<TeamPin, "lastMatch" | "nextMatch">, now: number): PinMatch | null {
  const { lastMatch: last, nextMatch: next } = pin;
  // ESPN può dare come prossima una partita appena chiusa: conta come ultima.
  const upcoming = next && next.state !== "post" ? next : null;
  if (upcoming && (upcoming.state === "in" || upcoming.kickoff - now < NEXT_TAKES_OVER_MS)) return upcoming;
  for (const closed of [last, next && next.state === "post" ? next : null]) if (closed && stillShown(closed, now)) return closed;
  return upcoming;
}

/** Il dato non arriva più: una partita in corso ferma da 2 minuti, o una in programma ferma da 12 ore. */
export function isUnavailable(m: PinMatch, now: number): boolean {
  if (m.state === "in") return now - m.fetchedAt > LIVE_STALE_MS;
  if (m.state === "pre") return now - m.fetchedAt > NEXT_STALE_MS;
  return false;
}

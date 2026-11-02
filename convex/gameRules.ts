/** Regole di sasso-carta-forbici al meglio di 3. Tutto il resto (tempi, mosse segrete) sta in `games.ts`. */
export type Move = "stone" | "paper" | "scissors";
export type RoundWinner = "a" | "b" | "draw";

export const WINS_NEEDED = 2;
/** Tetto ai round (pareggi compresi), perché la partita finisca sempre. */
export const MAX_ROUNDS = 6;
/** Durata del conto alla rovescia di ogni round, in cui si sceglie la mossa. */
export const COUNTDOWN_MS = 5000;
/** Pausa col risultato del round, prima del conto alla rovescia successivo. */
export const REVEAL_MS = 3500;
/** Tolleranza per le mosse che arrivano proprio sul filo (orologi e rete). */
export const GRACE_MS = 500;

const BEATS: Record<Move, Move> = { stone: "scissors", scissors: "paper", paper: "stone" };

/** Chi vince il round. Chi non sceglie in tempo perde; se non sceglie nessuno è pareggio. */
export function roundWinner(a: Move | undefined, b: Move | undefined): RoundWinner {
  if (a && b) return a === b ? "draw" : BEATS[a] === b ? "a" : "b";
  if (a) return "a";
  if (b) return "b";
  return "draw";
}

export function isOver(scoreA: number, scoreB: number, rounds: number): boolean {
  return scoreA >= WINS_NEEDED || scoreB >= WINS_NEEDED || rounds >= MAX_ROUNDS;
}

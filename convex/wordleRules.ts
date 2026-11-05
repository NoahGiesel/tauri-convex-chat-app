/**
 * Regole del Wordle Duel senza le liste di parole: il client può importare questo modulo.
 * Niente import: lo script che genera le liste lo carica con Node (`scripts/wordle-lists/build.mjs`).
 */
export type WordleLanguage = "it" | "en";
export type RunMinutes = 1 | 5 | 10;

/** Run timer tra cui sceglie chi sfida. */
export const RUN_MINUTES: readonly RunMinutes[] = [1, 5, 10];
export const WORDLE_LANGUAGES: readonly WordleLanguage[] = ["it", "en"];
/** Un invito senza risposta scade dopo 24 ore. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

/** Lettere ammesse: a–z; l'italiano toglie anche j, k, w, x, y (accenti e apostrofi restano fuori in entrambe). */
/** Le lettere di ogni lingua: l'italiano non ha j, k, w, x, y. */
const LETTERS: Record<WordleLanguage, string> = { en: "a-z", it: "a-il-vz" };
const LETTER_RULES: Record<WordleLanguage, RegExp> = {
  en: new RegExp(`^[${LETTERS.en}]{5}$`),
  it: new RegExp(`^[${LETTERS.it}]{5}$`),
};
const LETTER: Record<WordleLanguage, RegExp> = { en: new RegExp(`^[${LETTERS.en}]$`), it: new RegExp(`^[${LETTERS.it}]$`) };

/** Vero se la lettera (minuscola) si può scrivere in questa lingua: la tastiera mostra solo queste. */
export function isLetterOf(lang: WordleLanguage, letter: string): boolean {
  return LETTER[lang].test(letter);
}

/** true se la parola, così com'è, ha cinque lettere minuscole ammesse nella lingua. */
export function passesLetterRule(lang: WordleLanguage, word: string): boolean {
  return LETTER_RULES[lang].test(word);
}

/** Il tentativo come lo si confronta con le liste: senza spazi attorno e in minuscolo. */
export function foldGuess(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Le liste generate sono stringhe di parole da cinque lettere attaccate. */
export function unpack(packed: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < packed.length; i += 5) out.push(packed.slice(i, i + 5));
  return out;
}

/** Le soluzioni che non sono anche tentativi (deve essere vuoto: lo script si ferma altrimenti). */
export function missingFromGuesses(solutions: Iterable<string>, guesses: ReadonlySet<string>): string[] {
  return [...solutions].filter((word) => !guesses.has(word));
}

/** Il Duel si chiude 24 ore dopo l'accettazione (Duel deadline). */
export const DUEL_DEADLINE_MS = 24 * 60 * 60 * 1000;
/** Tolleranza per i tentativi che arrivano proprio sul filo (orologi e rete), come in sasso-carta-forbici. */
export const GRACE_MS = 500;
export const MAX_GUESSES = 6;
export const WORD_LENGTH = 5;

export type TileColor = "correct" | "present" | "absent";

/**
 * Colori di un tentativo, come nel Wordle classico: prima le lettere al posto giusto, poi le altre
 * diventano gialle finché la parola ha ancora quella lettera da assegnare.
 */
export function scoreGuess(guess: string, word: string): TileColor[] {
  const colors: TileColor[] = Array.from({ length: guess.length }, () => "absent");
  const left = new Map<string, number>();
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === word[i]) colors[i] = "correct";
    else left.set(word[i], (left.get(word[i]) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    const n = left.get(guess[i]) ?? 0;
    if (colors[i] === "correct" || n === 0) continue;
    colors[i] = "present";
    left.set(guess[i], n - 1);
  }
  return colors;
}

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
const LETTER_RULES: Record<WordleLanguage, RegExp> = {
  en: /^[a-z]{5}$/,
  it: /^[a-il-vz]{5}$/,
};

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

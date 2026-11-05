/**
 * Regola delle lettere del Wordle Duel, la stessa per lo script che genera le liste e per il server.
 * Niente import: lo script la carica con Node (`scripts/wordle-lists/build.mjs`).
 */
export type WordleLanguage = "it" | "en";

/** Lettere ammesse: a–z; l'italiano toglie anche j, k, w, x, y (accenti e apostrofi restano fuori in entrambe). */
const RULES: Record<WordleLanguage, RegExp> = {
  en: /^[a-z]{5}$/,
  it: /^[a-il-vz]{5}$/,
};

/** true se la parola, così com'è, ha cinque lettere minuscole ammesse nella lingua. */
export function passesLetterRule(lang: WordleLanguage, word: string): boolean {
  return RULES[lang].test(word);
}

/** Il tentativo come lo si confronta con le liste: senza spazi attorno e in minuscolo. */
export function foldGuess(raw: string): string {
  return raw.trim().toLowerCase();
}

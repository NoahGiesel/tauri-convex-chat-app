/**
 * Controllo dei tentativi e scelta della parola del Wordle Duel. Solo per il server: il client non importa
 * né questo modulo né `wordleLists`, così l'app non contiene le parole possibili.
 */
import { foldGuess, passesLetterRule, unpack, type WordleLanguage } from "./wordleRules";
import { EN_GUESSES, EN_SOLUTIONS, IT_GUESSES, IT_SOLUTIONS } from "./wordleLists";

const PACKED: Record<WordleLanguage, { guesses: string; solutions: string }> = {
  en: { guesses: EN_GUESSES, solutions: EN_SOLUTIONS },
  it: { guesses: IT_GUESSES, solutions: IT_SOLUTIONS },
};

/** Le liste si spezzano al primo uso, una volta per lingua. */
const unpacked = new Map<WordleLanguage, { guesses: Set<string>; solutions: string[] }>();

function listsOf(lang: WordleLanguage) {
  let lists = unpacked.get(lang);
  if (!lists) {
    lists = { guesses: new Set(unpack(PACKED[lang].guesses)), solutions: unpack(PACKED[lang].solutions) };
    unpacked.set(lang, lists);
  }
  return lists;
}

/** true se il tentativo, in minuscolo, è una parola della lingua. */
export function isGuess(lang: WordleLanguage, raw: string): boolean {
  const word = foldGuess(raw);
  return passesLetterRule(lang, word) && listsOf(lang).guesses.has(word);
}

/**
 * Pesca a caso una soluzione che non sia in `used` (le parole dei Duel già fatti nella chat);
 * se sono finite, pesca da tutta la lista. Va chiamata dentro l'handler, mai al caricamento del modulo.
 */
export function pickSolution(lang: WordleLanguage, used: ReadonlySet<string>): string {
  const all = listsOf(lang).solutions;
  const fresh = used.size === 0 ? all : all.filter((word) => !used.has(word));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

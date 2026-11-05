/**
 * Controllo dei tentativi e scelta della parola del Wordle Duel. Solo per il server: il client non importa
 * né questo modulo né `wordleLists`, così l'app non contiene le parole possibili.
 */
import { foldGuess, passesLetterRule, type WordleLanguage } from "./wordleLetters";
import { EN_GUESSES, EN_SOLUTIONS, IT_GUESSES, IT_SOLUTIONS } from "./wordleLists";

const PACKED: Record<WordleLanguage, { guesses: string; solutions: string }> = {
  en: { guesses: EN_GUESSES, solutions: EN_SOLUTIONS },
  it: { guesses: IT_GUESSES, solutions: IT_SOLUTIONS },
};

/** Le liste sono stringhe di parole da cinque lettere attaccate: si spezzano al primo uso. */
function unpack(packed: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < packed.length; i += 5) out.push(packed.slice(i, i + 5));
  return out;
}

const guessSets = new Map<WordleLanguage, Set<string>>();
const solutionLists = new Map<WordleLanguage, string[]>();

function guessesOf(lang: WordleLanguage): Set<string> {
  let set = guessSets.get(lang);
  if (!set) guessSets.set(lang, (set = new Set(unpack(PACKED[lang].guesses))));
  return set;
}

function solutionsOf(lang: WordleLanguage): string[] {
  let list = solutionLists.get(lang);
  if (!list) solutionLists.set(lang, (list = unpack(PACKED[lang].solutions)));
  return list;
}

/** true se il tentativo, in minuscolo, è una parola della lingua. */
export function isGuess(lang: WordleLanguage, raw: string): boolean {
  const word = foldGuess(raw);
  return passesLetterRule(lang, word) && guessesOf(lang).has(word);
}

/**
 * Pesca a caso una soluzione che non sia in `used` (le parole dei Duel già fatti nella chat);
 * se sono finite, pesca da tutta la lista. Va chiamata dentro l'handler, mai al caricamento del modulo.
 */
export function pickSolution(lang: WordleLanguage, used: ReadonlySet<string>): string {
  const all = solutionsOf(lang);
  const fresh = used.size === 0 ? all : all.filter((word) => !used.has(word));
  const pool = fresh.length > 0 ? fresh : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

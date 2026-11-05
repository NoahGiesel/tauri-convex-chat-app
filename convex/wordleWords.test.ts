/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { EN_GUESSES, EN_SOLUTIONS, IT_GUESSES, IT_SOLUTIONS } from "./wordleLists";
import { missingFromGuesses, passesLetterRule, unpack as words } from "./wordleRules";
import { isGuess, pickSolution } from "./wordleWords";

describe("regola delle lettere", () => {
  test("cinque lettere minuscole a–z", () => {
    expect(passesLetterRule("en", "crane")).toBe(true);
    expect(passesLetterRule("en", "cran")).toBe(false);
    expect(passesLetterRule("en", "cranes")).toBe(false);
    expect(passesLetterRule("en", "Crane")).toBe(false);
    expect(passesLetterRule("en", "can't")).toBe(false);
    expect(passesLetterRule("en", "a-bcd")).toBe(false);
  });

  test("l'inglese tiene j, k, w, x, y", () => {
    expect(passesLetterRule("en", "fjord")).toBe(true);
    expect(passesLetterRule("en", "nymph")).toBe(true);
  });

  test("l'italiano scarta accenti, apostrofi e j, k, w, x, y", () => {
    expect(passesLetterRule("it", "capra")).toBe(true);
    expect(passesLetterRule("it", "perché")).toBe(false);
    expect(passesLetterRule("it", "citta'")).toBe(false);
    expect(passesLetterRule("it", "città")).toBe(false);
    for (const word of ["jolly", "kiwii", "watts", "taxii", "yacht"]) expect(passesLetterRule("it", word)).toBe(false);
  });
});

describe("tentativi", () => {
  test("una parola della lista vale, in maiuscolo o con spazi attorno", () => {
    expect(isGuess("en", "crane")).toBe(true);
    expect(isGuess("en", "CRANE")).toBe(true);
    expect(isGuess("en", " Crane ")).toBe(true);
    expect(isGuess("it", "CAPRA")).toBe(true);
  });

  test("una parola fuori lista, corta o di un'altra lingua non vale", () => {
    expect(isGuess("en", "xxxxx")).toBe(false);
    expect(isGuess("en", "cran")).toBe(false);
    expect(isGuess("it", "crane")).toBe(false);
    expect(isGuess("en", "capra")).toBe(false);
  });

  test("le grafie britanniche sono tentativi ma mai soluzioni", () => {
    expect(isGuess("en", "fibre")).toBe(true);
    expect(words(EN_SOLUTIONS)).not.toContain("fibre");
    expect(words(EN_SOLUTIONS)).toContain("fiber");
  });

  test("le parole che mancano a Morph-it! entrano dalla lista a mano", () => {
    for (const word of ["capra", "aceto", "ovest", "audio"]) expect(isGuess("it", word)).toBe(true);
  });
});

describe("liste generate", () => {
  test.each([
    ["en", EN_GUESSES, EN_SOLUTIONS],
    ["it", IT_GUESSES, IT_SOLUTIONS],
  ] as const)("%s: ogni parola rispetta la regola e ogni soluzione è un tentativo", (lang, guesses, solutions) => {
    const guessList = words(guesses);
    const solutionList = words(solutions);
    expect(guessList.length * 5).toBe(guesses.length);
    expect(solutionList.length * 5).toBe(solutions.length);
    for (const word of [...guessList, ...solutionList]) expect(passesLetterRule(lang, word)).toBe(true);
    expect(missingFromGuesses(solutionList, new Set(guessList))).toEqual([]);
  });

  test("il controllo dello script trova la soluzione che non è un tentativo", () => {
    expect(missingFromGuesses(["crane", "zzzzz"], new Set(["crane"]))).toEqual(["zzzzz"]);
  });

  test("le varianti americane e le forme senza accento restano soluzioni", () => {
    for (const word of ["donut", "saute", "drier"]) expect(words(EN_SOLUTIONS)).toContain(word);
  });

  test("le forme rare sono tentativi ma non soluzioni", () => {
    expect(isGuess("en", "aahed")).toBe(true);
    expect(words(EN_SOLUTIONS)).not.toContain("aahed");
  });

  test("le dimensioni sono quelle della specifica, a meno di un margine", () => {
    expect(words(EN_GUESSES).length).toBeGreaterThan(8000);
    expect(words(EN_SOLUTIONS).length).toBeGreaterThan(1800);
    expect(words(IT_GUESSES).length).toBeGreaterThan(4500);
    expect(words(IT_SOLUTIONS).length).toBeGreaterThan(1800);
  });

  test("la lista delle esclusioni toglie le parole funzionali", () => {
    expect(words(IT_SOLUTIONS)).not.toContain("nella");
    expect(isGuess("it", "nella")).toBe(true);
  });
});

describe("scelta della soluzione", () => {
  test("pesca una soluzione della lingua", () => {
    const word = pickSolution("it", new Set());
    expect(words(IT_SOLUTIONS)).toContain(word);
  });

  test("evita le parole già usate finché ne restano", () => {
    const all = words(EN_SOLUTIONS);
    const used = new Set(all.slice(1));
    expect(pickSolution("en", used)).toBe(all[0]);
  });

  test("quando sono finite, ripesca da tutta la lista", () => {
    const all = words(EN_SOLUTIONS);
    expect(all).toContain(pickSolution("en", new Set(all)));
  });
});

test("nessun file del client importa le liste, neanche passando da un altro modulo di convex/", () => {
  const client = import.meta.glob<string>("../src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
  const server = import.meta.glob<string>("./*.ts", { query: "?raw", import: "default", eager: true });
  const importsOf = (text: string) => [...text.matchAll(/from\s+["'](?:\.\.\/)*(?:convex\/|\.\/)([\w]+)["']/g)].map((m) => m[1]);

  // Tutti i moduli di convex/ che il client raggiunge, direttamente o attraverso altri moduli.
  const reached = new Set<string>();
  const queue = Object.values(client).flatMap((text) => [...text.matchAll(/["'](?:\.\.\/)+convex\/(\w+)["']/g)].map((m) => m[1]));
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (reached.has(name) || name === "_generated") continue;
    reached.add(name);
    queue.push(...importsOf(server[`./${name}.ts`] ?? ""));
  }
  expect(reached).not.toContain("wordleLists");
  expect(reached).not.toContain("wordleWords");
});

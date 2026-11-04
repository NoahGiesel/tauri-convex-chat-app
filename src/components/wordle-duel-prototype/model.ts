// PROTOTYPE, throwaway. Wordle Duel UI prototype (wayfinder ticket #75). Not production code: in-memory state, tiny word lists.

export type Lang = "it" | "en";
export type Timer = 1 | 5 | 10;
export type Color = "g" | "y" | "x";
export type Guess = { word: string; colors: Color[] };
export type RunState = "toPlay" | "playing" | "finished";
export type Run = { state: RunState; guesses: Guess[]; solved: boolean; startedAt?: number; endedAt?: number; timedOut?: boolean };
export type Status = "invite" | "open" | "closed" | "declined" | "withdrawn" | "inviteExpired" | "expired";
export type Outcome = { winner: "me" | "them" | "draw"; reason: "guesses" | "faster" | "onlyOne" | "neither" | "forfeit" };
export type Duel = {
  status: Status;
  iAmChallenger: boolean;
  timer: Timer;
  lang: Lang;
  word: string;
  me: Run;
  them: Run;
  outcome?: Outcome;
  createdAt: number;
  acceptedAt?: number;
};

export const ME = "Stefan";
export const THEM = "Marco";
export const HOUR = 3_600_000;

// Tiny lists, only so the prototype can accept and reject guesses. The real lists come from the research ticket.
const EN = `crane plant light sword bread apple house water stone river money music night table chair smile heart earth ocean cloud storm grape lemon peach sugar honey brain train plane beach field grass green black white brown round sound world laugh dream glass metal paper ghost flame frost quiet queen crown prize pride track truck trust shine shirt spoon sweet sheep sleep steam steel stick store story swing tiger toast tower trace trade value voice watch wheel whale wrist write young zebra alarm angle arrow badge basic blend blink board brick bring brush candy chess chalk charm chest cider clean climb clock coast coral cream crisp dance delta eagle early fairy feast flute focus forge fresh giant globe grace happy horse input jelly juice knife lunar magic maple march mango noble olive orbit party piano pilot pizza plaza quest radio robin salad scale scarf shark slate snake solar spark spice stair sunny tulip unity vivid wagon`.split(" ");
const IT = `piano pasta fiore notte gatto cuore libro porta verde fuoco mondo tempo carta sedia tazza vento sogno luogo donna amico bello campo festa forte grano latte lungo madre padre marea mente molto nuovo occhi parte pesce piede pizza ponte prato punto radio ruota sasso scala senso stile tetto terra treno vespa vista zucca acqua aereo anima barca bocca borsa bosco calma canto carne cielo colle conto corpo corsa crema dente dolce fiume fondo frase gioco gente gesto grido isola lampo legno lento lince mappa menta miele morso nonna nonno palla panca penna perla pollo rombo rosso santo scopo segno serra sfera spada spesa stato stima suono tasca tigre torre torta uscio valle vasca vetro vigna volpe zaino zebra`.split(" ");
export const WORDS: Record<Lang, Set<string>> = { en: new Set(EN), it: new Set(IT) };
export const SOLUTIONS: Record<Lang, string[]> = { en: ["crane", "plant", "light", "sword", "bread"], it: ["piano", "fiore", "notte", "gatto", "libro"] };
export const EXCLUDED_IT = new Set(["j", "k", "w", "x", "y"]);

export function score(guess: string, word: string): Color[] {
  const out: Color[] = Array(5).fill("x");
  const left: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === word[i]) out[i] = "g";
    else left[word[i]] = (left[word[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] === "g") continue;
    if ((left[guess[i]] ?? 0) > 0) {
      out[i] = "y";
      left[guess[i]]--;
    }
  }
  return out;
}

export const runMs = (r: Run, timer: Timer) =>
  r.timedOut ? timer * 60_000 : r.startedAt !== undefined && r.endedAt !== undefined ? r.endedAt - r.startedAt : 0;

export function decide(d: Duel): Outcome {
  const a = d.me;
  const b = d.them;
  if (a.solved && !b.solved) return { winner: "me", reason: "onlyOne" };
  if (b.solved && !a.solved) return { winner: "them", reason: "onlyOne" };
  if (!a.solved && !b.solved) return { winner: "draw", reason: "neither" };
  if (a.guesses.length !== b.guesses.length) return { winner: a.guesses.length < b.guesses.length ? "me" : "them", reason: "guesses" };
  const ta = runMs(a, d.timer);
  const tb = runMs(b, d.timer);
  if (ta === tb) return { winner: "draw", reason: "neither" };
  return { winner: ta < tb ? "me" : "them", reason: "faster" };
}

export const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const fmtHours = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};

/** A finished run built from a list of guesses, as the opponent's canned play. */
export function cannedRun(word: string, lang: Lang, guesses: string[], ms: number, now: number): Run {
  const pool = [...WORDS[lang]].filter((w) => w !== word);
  const list = guesses.map((g, i) => (g === "*" ? word : g === "?" ? pool[(i * 7) % pool.length] : g));
  const gs = list.map((w) => ({ word: w, colors: score(w, word) }));
  const solved = list[list.length - 1] === word;
  return { state: "finished", guesses: gs, solved, startedAt: now - ms - 60_000, endedAt: now - 60_000, timedOut: !solved && list.length < 6 };
}

function base(now: number, lang: Lang = "it", timer: Timer = 5): Duel {
  const word = SOLUTIONS[lang][0];
  return {
    status: "open",
    iAmChallenger: true,
    timer,
    lang,
    word,
    me: { state: "toPlay", guesses: [], solved: false },
    them: { state: "toPlay", guesses: [], solved: false },
    createdAt: now - 2 * HOUR,
    acceptedAt: now - HOUR,
  };
}

export const SCENARIOS: { id: string; label: string; make: (now: number, lang: Lang) => Duel }[] = [
  { id: "invite-sent", label: "Invite: you challenged Marco", make: (n, l) => ({ ...base(n, l), status: "invite", createdAt: n - 20 * 60_000, acceptedAt: undefined }) },
  { id: "invite-got", label: "Invite: Marco challenged you", make: (n, l) => ({ ...base(n, l), status: "invite", iAmChallenger: false, createdAt: n - 3 * HOUR, acceptedAt: undefined }) },
  { id: "declined", label: "Declined", make: (n, l) => ({ ...base(n, l), status: "declined" }) },
  { id: "withdrawn", label: "Withdrawn", make: (n, l) => ({ ...base(n, l), status: "withdrawn" }) },
  { id: "invite-expired", label: "Invite expired (no answer in 24 h)", make: (n, l) => ({ ...base(n, l), status: "inviteExpired", acceptedAt: undefined }) },
  { id: "open-both", label: "Open: both to play", make: (n, l) => base(n, l) },
  { id: "open-them-playing", label: "Open: Marco playing, you to play", make: (n, l) => ({ ...base(n, l), them: { state: "playing", guesses: [], solved: false, startedAt: n - 40_000 } }) },
  { id: "open-me-done", label: "Open: you finished, Marco to play", make: (n, l) => { const d = base(n, l); return { ...d, me: cannedRun(d.word, l, ["?", "?", "*"], 72_000, n) }; } },
  { id: "open-them-done", label: "Open: Marco finished, you to play", make: (n, l) => { const d = base(n, l); return { ...d, them: cannedRun(d.word, l, ["?", "?", "?", "*"], 95_000, n) }; } },
  { id: "won", label: "Closed: you won (fewer guesses)", make: (n, l) => closed(base(n, l), l, n, ["?", "?", "*"], 80_000, ["?", "?", "?", "*"], 60_000) },
  { id: "lost-faster", label: "Closed: you lost (same guesses, Marco faster)", make: (n, l) => closed(base(n, l), l, n, ["?", "?", "?", "*"], 140_000, ["?", "?", "?", "*"], 90_000) },
  { id: "lost-only", label: "Closed: you lost (only Marco guessed)", make: (n, l) => closed(base(n, l), l, n, ["?", "?", "?", "?", "?", "?"], 200_000, ["?", "?", "?", "?", "*"], 150_000) },
  { id: "draw", label: "Closed: draw (neither guessed)", make: (n, l) => closed(base(n, l), l, n, ["?", "?", "?", "?", "?", "?"], 210_000, ["?", "?", "?"], 0, true) },
  { id: "forfeit", label: "Closed: you win by forfeit (Marco never played)", make: (n, l) => { const d = base(n, l); return { ...d, status: "closed", me: cannedRun(d.word, l, ["?", "?", "?", "*"], 100_000, n), outcome: { winner: "me", reason: "forfeit" } }; } },
  { id: "expired", label: "Expired: neither played in 24 h", make: (n, l) => ({ ...base(n, l), status: "expired" }) },
];

function closed(d: Duel, l: Lang, n: number, mine: string[], myMs: number, theirs: string[], theirMs: number, theirTimeout = false): Duel {
  const me = cannedRun(d.word, l, mine, myMs, n);
  const them = cannedRun(d.word, l, theirs, theirMs, n);
  if (theirTimeout) them.timedOut = true;
  const out = { ...d, status: "closed" as const, me, them };
  return { ...out, outcome: decide(out) };
}

/** Regole e lettura delle domande del quiz. Tempi e stato stanno in `quizzes.ts`. */
export interface QuizQuestion {
  topic: string;
  text: string;
  options: string[];
  correct: number;
}

/** Tempo per rispondere a ogni domanda. */
export const QUIZ_COUNTDOWN_MS = 15_000;
/** Pausa con le risposte rivelate, prima della domanda successiva. */
export const QUIZ_REVEAL_MS = 3000;
export const QUIZ_GRACE_MS = 500;
export const QUIZ_SIZES = [3, 5] as const;
export const TOPIC_MAX = 60;

/** Argomenti puliti: tutti presenti, di lunghezza ragionevole. `null` se qualcosa non va. */
export function cleanTopics(topics: string[], size: number): string[] | null {
  if (topics.length !== size) return null;
  const clean = topics.map((t) => t.replace(/\s+/g, " ").trim());
  return clean.every((t) => t.length >= 1 && t.length <= TOPIC_MAX) ? clean : null;
}

/** Argomenti in ordine di gioco: uno di A, uno di B, e così via. */
export function interleave<T>(a: T[], b: T[]): T[] {
  return a.flatMap((topic, i) => (b[i] === undefined ? [topic] : [topic, b[i]]));
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Legge la risposta del modello (un oggetto JSON con `questions`) e la controlla: una domanda per argomento, 4 opzioni diverse,
 * una sola giusta. Le opzioni si rimescolano, così la risposta giusta non sta quasi sempre nello stesso posto.
 */
export function parseQuestions(raw: string, topics: (string | null)[]): QuizQuestion[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = (data as { questions?: unknown }).questions;
  if (!Array.isArray(list) || list.length !== topics.length) return null;

  const out: QuizQuestion[] = [];
  for (let i = 0; i < list.length; i++) {
    const q = list[i] as { topic?: unknown; question?: unknown; options?: unknown; correct?: unknown };
    if (typeof q.question !== "string" || q.question.trim().length < 5 || q.question.length > 300) return null;
    if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.every((o) => typeof o === "string" && o.trim().length > 0 && o.length <= 120)) return null;
    if (typeof q.correct !== "number" || !Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return null;
    const options = (q.options as string[]).map((o) => o.trim());
    if (new Set(options.map((o) => o.toLowerCase())).size !== 4) return null;
    const right = options[q.correct];
    const mixed = shuffled(options);
    // Argomento scelto dai giocatori, oppure (se era "casuale") quello che il modello dichiara per questa domanda.
    const chosen = typeof q.topic === "string" ? q.topic.replace(/\s+/g, " ").trim().slice(0, TOPIC_MAX) : "";
    out.push({ topic: topics[i] ?? (chosen || "?"), text: q.question.trim(), options: mixed, correct: mixed.indexOf(right) });
  }
  return out;
}

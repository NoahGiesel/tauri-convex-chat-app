import type { Doc } from "./_generated/dataModel";

/** Una trascrizione "in corso" più vecchia di così si considera fallita (l'azione si è interrotta). */
export const SUMMARY_STALE_MS = 5 * 60_000;

export type SummaryState = "pending" | "done" | "failed";

/** Stato di un messaggio-riassunto: in corso, pronto o fallito (rimasto in corso troppo a lungo). */
export function summaryState(message: Pick<Doc<"messages">, "summaryStatus" | "_creationTime">, now: number): SummaryState {
  if (message.summaryStatus !== "pending") return "done";
  return now - message._creationTime < SUMMARY_STALE_MS ? "pending" : "failed";
}

/** Un riassunto già presente (pronto o ancora in corso) impedisce di chiederne un altro; uno fallito no. */
export const blocksNewSummary = (message: Pick<Doc<"messages">, "summaryStatus" | "_creationTime"> | null, now: number) =>
  message !== null && summaryState(message, now) !== "failed";

/** Stato di una risposta di /ask: stessa regola dei riassunti (in corso da troppo tempo = fallita). */
export function askState(message: Pick<Doc<"messages">, "askStatus" | "_creationTime">, now: number): SummaryState {
  if (message.askStatus !== "pending") return "done";
  return now - message._creationTime < SUMMARY_STALE_MS ? "pending" : "failed";
}

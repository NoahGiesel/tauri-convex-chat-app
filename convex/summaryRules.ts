import type { Doc } from "./_generated/dataModel";

/** Una trascrizione "in corso" più vecchia di così si considera fallita (l'azione si è interrotta). */
export const SUMMARY_STALE_MS = 5 * 60_000;

export type SummaryState = "pending" | "done" | "failed";

/** Stato di un messaggio-riassunto: in corso, pronto o fallito (una mutation programmata lo segna "failed" se resta in corso troppo a lungo). */
export function summaryState(message: Pick<Doc<"messages">, "summaryStatus">): SummaryState {
  return message.summaryStatus ?? "done";
}

/** Un riassunto già presente (pronto o ancora in corso) impedisce di chiederne un altro; uno fallito no. */
export const blocksNewSummary = (message: Pick<Doc<"messages">, "summaryStatus"> | null) =>
  message !== null && summaryState(message) !== "failed";

/** Stato di una risposta di /ask: stessa regola dei riassunti. */
export function askState(message: Pick<Doc<"messages">, "askStatus">): SummaryState {
  return message.askStatus ?? "done";
}

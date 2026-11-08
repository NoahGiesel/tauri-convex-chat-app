import { ConvexError } from "convex/values";
import { en, type MessageKey } from "@/i18n/en";

/**
 * Il backend lancia `ConvexError({ code })`: qui il codice diventa la chiave di traduzione
 * `error.<code>`. Qualsiasi altro errore (rete, bug) usa il messaggio generico.
 */
export function errorKey(error: unknown): MessageKey {
  const code = errorCode(error);
  const key = `error.${code}`;
  return code !== null && key in en ? (key as MessageKey) : "error.generic";
}

/** Il codice di un `ConvexError({ code })` del backend; null per ogni altro errore. */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && "code" in data && typeof data.code === "string" ? data.code : null;
}

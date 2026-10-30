import { ConvexError } from "convex/values";
import { en, type MessageKey } from "@/i18n/en";

/**
 * Il backend lancia `ConvexError({ code })`: qui il codice diventa la chiave di traduzione
 * `error.<code>`. Qualsiasi altro errore (rete, bug) usa il messaggio generico.
 */
export function errorKey(error: unknown): MessageKey {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "object" && data !== null && "code" in data && typeof data.code === "string") {
      const key = `error.${data.code}`;
      if (key in en) return key as MessageKey;
    }
  }
  return "error.generic";
}

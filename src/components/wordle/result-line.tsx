import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/i18n-provider";
import { formatWordleResult } from "@/lib/wordle";

/** Il messaggio senza autore che annuncia la chiusura di un Wordle Duel; un clic porta alla scheda col risultato. */
export function WordleResultLine({ duelId }: { duelId: Id<"wordleDuels"> }) {
  const { t } = useI18n();
  const duel = useQuery(api.wordleDuels.get, { duelId });
  if (!duel?.summary) return null;

  const showCard = () =>
    document.querySelector(`[data-wordle-duel="${duelId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="my-2 flex justify-center">
      <button
        type="button"
        data-testid="wordle-result-line"
        onClick={showCard}
        className="rounded-full border border-app-border bg-app-field/60 px-3 py-1 text-xs font-semibold text-app-text-muted hover:bg-app-raised hover:text-app-text-strong"
      >
        🏁 {formatWordleResult(duel.summary, t)}
      </button>
    </div>
  );
}

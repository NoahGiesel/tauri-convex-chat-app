import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/i18n-provider";
import { formatGeoResult } from "@/lib/geo";

/** Il messaggio senza autore che annuncia la chiusura di un Geo Duel; un clic porta alla scheda col risultato. */
export function GeoResultLine({ duelId, onShowCard }: { duelId: Id<"geoDuels">; onShowCard: () => void }) {
  const { t, locale } = useI18n();
  const duel = useQuery(api.geoDuels.get, { duelId });
  if (!duel?.summary) return null;

  return (
    <div className="my-2 flex justify-center">
      <button
        type="button"
        data-testid="geo-result-line"
        onClick={onShowCard}
        className="rounded-full border border-app-border bg-app-field/60 px-3 py-1 text-xs font-semibold text-app-text-muted hover:bg-app-raised hover:text-app-text-strong"
      >
        🏁 {formatGeoResult(duel.summary, t, locale)}
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { usePing } from "@/hooks/use-ping";
import { useI18n } from "@/i18n/i18n-provider";
import { getPingCompact, getPingPlace, onPingPlaceChange } from "@/lib/ping-pref";
import { cn } from "@/lib/utils";

/** Verde sotto 100 ms, arancione fino a 350, rosso oltre (o senza risposta). Compare solo nel posto scelto nelle Preferenze. */
export function PingIndicator({ place, onClick }: { place: "status" | "bottomLeft" | "bottomRight" | "avatar" | "composer"; onClick?: () => void }) {
  const { t } = useI18n();
  const [chosen, setChosen] = useState(getPingPlace);
  const [compact, setCompact] = useState(getPingCompact);
  useEffect(
    () =>
      onPingPlaceChange(() => {
        setChosen(getPingPlace());
        setCompact(getPingCompact());
      }),
    [],
  );

  const show = chosen === place;
  const ping = usePing(show);
  if (!show || !ping) return null;

  const ms = "offline" in ping ? null : ping.ms;
  const tone = ms == null || ms > 350 ? "bg-red-500" : ms >= 100 ? "bg-orange-400" : "bg-emerald-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 font-medium text-app-text-dim opacity-80 transition-opacity hover:opacity-100",
        place === "avatar" ? "text-[10px]" : "text-[11px]",
        !onClick && "cursor-default",
      )}
      title={t("side.pingHint")}
    >
      <span className={cn("size-1.5 rounded-full", tone)} />
      {compact || place === "avatar" || place === "composer" ? null : `${t("side.ping")}: `}
      {ms == null ? t("side.pingOffline") : `${ms} ms`}
    </button>
  );
}

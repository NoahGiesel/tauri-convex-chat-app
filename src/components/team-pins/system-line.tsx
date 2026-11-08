import { useI18n } from "@/i18n/i18n-provider";

/** La riga di sistema al centro della chat, "📌 Stefan ha pinnato Inter", nello stile della riga del Wordle Duel. */
export function SystemLine({ system }: { system: { action: "pinned" | "unpinned"; name: string; teamName: string } }) {
  const { t } = useI18n();
  return (
    <div className="my-2 flex justify-center">
      <span data-testid="system-line" className="rounded-full border border-app-border bg-app-field/60 px-3 py-1 text-xs font-semibold text-app-text-muted">
        {t(system.action === "pinned" ? "teamPins.pinned" : "teamPins.unpinned", { name: system.name, team: system.teamName })}
      </span>
    </div>
  );
}

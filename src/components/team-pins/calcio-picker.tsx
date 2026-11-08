import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Crest } from "@/components/team-pins/crest";
import { useI18n } from "@/i18n/i18n-provider";
import { errorCode, errorKey } from "@/lib/errors";
import { cn } from "@/lib/utils";

/**
 * Il picker di `/calcio`, sopra il campo del messaggio (dove compaiono i suggerimenti dei comandi).
 * Il testo si può ancora cambiare; i rifiuti (squadra già pinnata, 3 squadre) compaiono qui dentro.
 */
export function CalcioPicker({
  conversationId,
  initialText,
  onClose,
}: {
  conversationId: Id<"conversations">;
  initialText: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(initialText);
  const [selected, setSelected] = useState(0);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shortText = text.trim().length < 2;
  const results = useQuery(api.footballTeams.search, shortText ? "skip" : { text });
  const pins = useQuery(api.teamPins.list, { conversationId });
  const add = useMutation(api.teamPins.add);
  const pinned = new Set((pins ?? []).map((p) => p.team.teamId));

  useEffect(() => input.current?.focus(), []);

  async function choose(team: { teamId: string; name: string }) {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    try {
      await add({ conversationId, teamId: team.teamId });
      onClose();
    } catch (e) {
      setRefusal(errorCode(e) === "team_already_pinned" ? t("teamPins.alreadyPinned", { team: team.name }) : t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const rows = results ?? [];
  const current = Math.min(selected, Math.max(rows.length - 1, 0));
  return (
    <div data-testid="calcio-picker" className="absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border border-app-border-strong bg-app-panel p-1 shadow-xl">
      <div className="flex items-center gap-2 px-2 pt-1 pb-1.5">
        <span className="text-xs font-bold text-app-text-muted">/calcio</span>
        <input
          ref={input}
          value={text}
          aria-label={t("teamPins.searchPlaceholder")}
          placeholder={t("teamPins.searchPlaceholder")}
          onChange={(e) => {
            setText(e.target.value);
            setSelected(0);
            setRefusal(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (rows.length > 0) setSelected((current + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (rows[current]) void choose(rows[current]);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-app-text-dim"
        />
        <button
          type="button"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
          className="rounded p-0.5 text-app-text-dim hover:text-app-text"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {refusal && (
        <p role="alert" className="mx-2 mb-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {refusal}
        </p>
      )}
      {shortText ? (
        <p className="px-3 py-2 text-sm text-app-text-muted">{t("teamPins.typeMore")}</p>
      ) : results && rows.length === 0 ? (
        <p className="px-3 py-2 text-sm text-app-text-muted">{t("teamPins.noResults", { text: text.trim() })}</p>
      ) : (
        <div role="listbox" aria-label={t("teamPins.searchPlaceholder")}>
          {rows.map((team, i) => (
            <button
              key={team.teamId}
              type="button"
              role="option"
              aria-selected={i === current}
              disabled={busy}
              onMouseEnter={() => setSelected(i)}
              onClick={() => void choose(team)}
              className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm", i === current ? "bg-app-accent-soft" : "hover:bg-app-field")}
            >
              <Crest logo={team.logo} abbreviation={team.abbreviation} size={22} />
              <span className="font-semibold text-app-text-strong">{team.name}</span>
              <span className="text-xs text-app-text-muted">{team.national ? t("teamPins.nationalTeam") : team.competition}</span>
              {pinned.has(team.teamId) && <span className="ml-auto text-xs text-app-text-dim">{t("teamPins.pinnedMark")}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

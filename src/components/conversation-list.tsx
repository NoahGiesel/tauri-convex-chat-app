import { useMemo, useState } from "react";
import { Search, Settings, UserPlus, UsersRound } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar, GroupAvatar } from "@/components/avatar";
import type { ConversationItem } from "@/components/chat-app";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/** Barra laterale: profilo, ricerca e lista unica delle chat (amici e gruppi insieme). */
export function ConversationList({
  me,
  conversations,
  selectedIds,
  pendingRequests,
  onSelect,
  onOpenInvite,
  onOpenGroup,
  onOpenSettings,
}: {
  me: { name: string; avatarIndex: number } | null | undefined;
  conversations: ConversationItem[] | null | undefined;
  selectedIds: Set<Id<"conversations">>;
  pendingRequests: number;
  onSelect: (id: Id<"conversations">) => void;
  onOpenInvite: () => void;
  onOpenGroup: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!conversations) return [];
    return q ? conversations.filter((c) => c.title.toLocaleLowerCase().includes(q)) : conversations;
  }, [conversations, query]);

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-app-border bg-app-sidebar">
      <div className="flex items-center gap-3 p-4">
        <div className="relative size-[46px] shrink-0">
          <Avatar name={me?.name ?? ""} index={0} size={46} accent className="text-lg" />
          <span className="absolute -right-[3px] -bottom-[3px] size-3.5 rounded-full border-[3px] border-app-sidebar bg-app-online" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold text-app-text-strong">{me?.name ?? "…"}</div>
          <div className="text-[13px] font-semibold text-app-online">{t("side.online")}</div>
        </div>
        <button
          type="button"
          aria-label={t("nav.settings")}
          onClick={onOpenSettings}
          className="flex size-10 items-center justify-center rounded-[10px] text-app-text-muted hover:bg-app-field"
        >
          <Settings className="size-5" strokeWidth={1.8} />
        </button>
      </div>

      <div className="px-4 pb-3">
        <label htmlFor="search" className="sr-only">
          {t("side.search")}
        </label>
        <div className="relative">
          <Search className="absolute top-3 left-3 size-4 text-app-text-dim" strokeWidth={2} />
          <input
            id="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("side.search")}
            autoComplete="off"
            className="h-10 w-full rounded-[10px] border border-app-border bg-app-bg pr-3 pl-9 text-sm text-app-text outline-none placeholder:text-app-text-dim focus:border-app-accent-bright"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex items-center gap-0.5 px-2 pt-2 pb-1.5 text-xs font-extrabold tracking-[0.08em] text-app-text-dim">
          <span className="flex-1 uppercase">{t("chat.title")}</span>
          <button
            type="button"
            aria-label={t("side.addFriend")}
            onClick={onOpenInvite}
            className="relative flex size-8 items-center justify-center rounded-lg text-app-accent-text hover:bg-app-field"
          >
            <UserPlus className="size-[18px]" strokeWidth={2} />
            {pendingRequests > 0 && (
              <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full border-2 border-app-sidebar bg-app-accent" />
            )}
          </button>
          <button
            type="button"
            aria-label={t("side.createGroup")}
            onClick={onOpenGroup}
            className="flex size-8 items-center justify-center rounded-lg text-app-accent-text hover:bg-app-field"
          >
            <UsersRound className="size-[18px]" strokeWidth={2} />
          </button>
        </div>

        {conversations && conversations.length === 0 && (
          <p className="px-2 py-3 text-sm text-app-text-muted">{t("chat.empty")}</p>
        )}
        {conversations && conversations.length > 0 && visible.length === 0 && (
          <p className="px-2 py-3 text-sm text-app-text-muted">{t("side.noResults")}</p>
        )}

        {visible.map((c) => {
          const selected = selectedIds.has(c._id);
          return (
            <button
              key={c._id}
              type="button"
              onClick={() => onSelect(c._id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors",
                selected ? "bg-app-accent-soft" : "hover:bg-app-field/60",
              )}
            >
              {c.kind === "group" ? <GroupAvatar /> : <Avatar name={c.title} index={c.avatarIndex} />}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[15px]",
                    selected ? "font-bold text-app-text-strong" : c.unread ? "font-bold text-app-text-strong" : "font-bold text-app-text",
                  )}
                >
                  {c.title}
                </span>
                <span
                  className={cn("block truncate text-[13px]", c.unread ? "text-app-text" : "text-app-text-muted")}
                >
                  {c.lastMessagePreview ?? t("chat.noPreview")}
                </span>
              </span>
              {c.unread && <span className="size-2.5 shrink-0 rounded-full bg-app-accent" />}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

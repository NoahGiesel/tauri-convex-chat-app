import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeftRight, Columns2, Rows2, Square, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar, GroupAvatar } from "@/components/avatar";
import { ConversationList } from "@/components/conversation-list";
import { ConversationView } from "@/components/conversation-view";
import { GroupModal } from "@/components/group-modal";
import { InviteModal } from "@/components/invite-modal";
import { useI18n } from "@/i18n/i18n-provider";
import { usePresenceHeartbeat } from "@/lib/presence";
import { cn } from "@/lib/utils";

export type ConversationItem = NonNullable<FunctionReturnType<typeof api.conversations.list>>[number];

type ConversationId = Id<"conversations">;
type Layout = "single" | "columns" | "rows";
type Panes = [ConversationId | null, ConversationId | null];

const LAYOUT_KEY = "chat:layout";

function readLayout(): Layout {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY);
    if (stored === "single" || stored === "columns" || stored === "rows") return stored;
  } catch {
    // storage non disponibile
  }
  return "single";
}

/**
 * Pagina Chat: barra laterale, schede delle chat aperte e uno o due pannelli (vista divisa).
 * Un click su una chat la apre nel pannello attivo.
 */
export function ChatApp({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useI18n();
  usePresenceHeartbeat();
  const me = useQuery(api.users.me);
  const conversations = useQuery(api.conversations.list);
  const friends = useQuery(api.friends.list);

  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const [panes, setPanes] = useState<Panes>([null, null]);
  const [focus, setFocus] = useState<0 | 1>(0);
  const [tabs, setTabs] = useState<ConversationId[]>([]);
  const [modal, setModal] = useState<"invite" | "group" | null>(null);

  const split = layout !== "single";
  const visiblePanes: (0 | 1)[] = split ? [0, 1] : [0];
  const activeIndex = split ? focus : 0;

  const byId = useMemo(() => new Map((conversations ?? []).map((c) => [c._id, c])), [conversations]);

  function setLayout(next: Layout) {
    setLayoutState(next);
    if (next === "single") setFocus(0);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // vale solo per questa sessione
    }
  }

  function openChat(id: ConversationId) {
    setTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setPanes((prev) => {
      const next: Panes = [prev[0], prev[1]];
      next[activeIndex] = id;
      return next;
    });
  }

  function closeTab(id: ConversationId) {
    const index = tabs.indexOf(id);
    const remaining = tabs.filter((tab) => tab !== id);
    const fallback = remaining[index] ?? remaining[index - 1] ?? null;
    setTabs(remaining);
    setPanes((prev) => [prev[0] === id ? fallback : prev[0], prev[1] === id ? fallback : prev[1]]);
  }

  const selectedIds = new Set<ConversationId>(
    (split ? panes : [panes[0]]).filter((p): p is ConversationId => p !== null),
  );

  const layoutButtons: { value: Layout; label: string; icon: typeof Square }[] = [
    { value: "single", label: t("layout.single"), icon: Square },
    { value: "columns", label: t("layout.columns"), icon: Columns2 },
    { value: "rows", label: t("layout.rows"), icon: Rows2 },
  ];

  return (
    <div className="flex h-full min-h-0">
      <ConversationList
        me={me}
        conversations={conversations}
        selectedIds={selectedIds}
        pendingRequests={friends?.incoming.length ?? 0}
        onSelect={openChat}
        onOpenInvite={() => setModal("invite")}
        onOpenGroup={() => setModal("group")}
        onOpenSettings={onOpenSettings}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-app-panel">
        {/* Schede delle chat aperte + layout */}
        <div className="flex shrink-0 items-end gap-1 bg-app-bg px-3 pt-2">
          <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
            {tabs.map((id) => {
              const c = byId.get(id);
              if (!c) return null;
              const active = id === panes[activeIndex];
              return (
                <div
                  key={id}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-t-xl pr-2 pl-3 text-sm",
                    active ? "h-11 bg-app-panel font-bold text-app-text-strong" : "h-10 font-semibold text-app-text-muted",
                  )}
                >
                  <button type="button" onClick={() => openChat(id)} className="flex items-center gap-2.5">
                    {c.kind === "group" ? <GroupAvatar size={26} /> : <Avatar name={c.title} index={c.avatarIndex} size={26} />}
                    <span className="max-w-40 truncate">{c.title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={t("tabs.close", { name: c.title })}
                    onClick={() => closeTab(id)}
                    className="flex size-[26px] items-center justify-center rounded-md text-app-text-dim hover:bg-app-field"
                  >
                    <X className="size-3.5" strokeWidth={2.4} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mb-1.5 flex shrink-0 items-center gap-2">
            {split && (
              <button
                type="button"
                onClick={() => setPanes((prev) => [prev[1], prev[0]])}
                className="flex h-8 items-center gap-2 rounded-[9px] border border-app-border-strong px-3 text-[13px] font-bold text-app-text hover:bg-app-field"
              >
                <ArrowLeftRight className="size-4" strokeWidth={2} />
                {t("layout.swap")}
              </button>
            )}
            <div role="group" aria-label="Layout" className="flex gap-0.5 rounded-[11px] bg-app-field p-[3px]">
              {layoutButtons.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={layout === value}
                  onClick={() => setLayout(value)}
                  className={cn(
                    "flex h-8 w-9 items-center justify-center rounded-lg",
                    layout === value ? "bg-app-accent-soft text-app-text-strong" : "text-app-text-muted hover:text-app-text",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.8} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pannelli */}
        <div className={cn("flex min-h-0 flex-1", layout === "rows" ? "flex-col" : "flex-row")}>
          {visiblePanes.map((i) => {
            const id = panes[i];
            return (
              <div
                key={i}
                onMouseDownCapture={() => setFocus(i)}
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col",
                  i === 1 && (layout === "columns" ? "border-l border-app-border" : "border-t border-app-border"),
                )}
              >
                {split && <div className={cn("h-[3px] shrink-0", focus === i ? "bg-app-accent" : "bg-transparent")} />}
                {id ? (
                  <ConversationView key={id} conversationId={id} />
                ) : (
                  <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-app-text-muted">
                    {split ? t("layout.emptyPane") : t("chat.select")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {modal === "invite" && <InviteModal onClose={() => setModal(null)} onOpenChat={openChat} />}
      {modal === "group" && <GroupModal onClose={() => setModal(null)} onOpenChat={openChat} />}
    </div>
  );
}

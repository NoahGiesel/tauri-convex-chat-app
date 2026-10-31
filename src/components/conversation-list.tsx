import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings,
  UserPlus,
  UsersRound,
} from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar, GroupAvatar } from "@/components/avatar";
import type { ConversationItem } from "@/components/chat-app";
import { SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_RAIL, useSidebar } from "@/hooks/use-sidebar";
import { useI18n } from "@/i18n/i18n-provider";
import { usePresence } from "@/lib/presence";
import { cn } from "@/lib/utils";

/**
 * Barra laterale: profilo, ricerca e lista unica delle chat (amici e gruppi insieme).
 * Si ridimensiona trascinando il bordo, si comprime in una barra di soli avatar e può stare a sinistra o a destra.
 */
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
  const presence = usePresence();
  const { width, collapsed, side, setWidth, resetWidth, setCollapsed } = useSidebar();
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!conversations) return [];
    return q ? conversations.filter((c) => c.title.toLocaleLowerCase().includes(q)) : conversations;
  }, [conversations, query]);

  const onRight = side === "right";
  const CollapseIcon = onRight ? PanelRightClose : PanelLeftClose;
  const ExpandIcon = onRight ? PanelRightOpen : PanelLeftOpen;

  // --- ridimensionamento: trascina il bordo verso il centro dell'app
  function onHandlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (collapsed || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function onHandlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging || !asideRef.current) return;
    const rect = asideRef.current.getBoundingClientRect();
    setWidth(onRight ? rect.right - e.clientX : e.clientX - rect.left);
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  function onHandleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Per la tastiera: la freccia verso il centro allarga, quella verso il bordo restringe.
    const grow = onRight ? "ArrowLeft" : "ArrowRight";
    const shrink = onRight ? "ArrowRight" : "ArrowLeft";
    if (e.key === grow) setWidth(width + 16);
    else if (e.key === shrink) setWidth(width - 16);
    else if (e.key === "Home") resetWidth();
    else return;
    e.preventDefault();
  }

  const handle = !collapsed && (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("sidebar.resize")}
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      onPointerDown={onHandlePointerDown}
      onPointerMove={onHandlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={resetWidth}
      onKeyDown={onHandleKeyDown}
      className={cn(
        "absolute inset-y-0 z-10 w-1.5 cursor-col-resize outline-none transition-colors hover:bg-app-accent/40 focus-visible:bg-app-accent/60",
        onRight ? "-left-[3px]" : "-right-[3px]",
        dragging && "bg-app-accent/60",
      )}
    />
  );

  const asideClass = cn(
    "relative flex shrink-0 flex-col bg-app-sidebar",
    onRight ? "order-last border-l border-app-border" : "border-r border-app-border",
  );

  // ---------- barra compressa: solo avatar ----------
  if (collapsed) {
    return (
      <aside ref={asideRef} className={cn(asideClass, "items-center gap-2.5 py-3.5")} style={{ width: SIDEBAR_RAIL }}>
        <button
          type="button"
          aria-label={t("sidebar.expand")}
          title={t("sidebar.expand")}
          onClick={() => setCollapsed(false)}
          className="flex size-10 items-center justify-center rounded-[10px] text-app-text-muted hover:bg-app-field"
        >
          <ExpandIcon className="size-5" strokeWidth={1.8} />
        </button>

        <div className="relative size-11">
          <Avatar name={me?.name ?? ""} index={0} size={44} accent />
          <span className="absolute -right-[3px] -bottom-[3px] size-3.5 rounded-full border-[3px] border-app-sidebar bg-app-online" />
        </div>
        <div className="h-px w-8 bg-app-border" />

        <div className="flex min-h-0 flex-1 flex-col items-center gap-2.5 overflow-y-auto px-2 py-1">
          {(conversations ?? []).map((c) => {
            const selected = selectedIds.has(c._id);
            return (
              <button
                key={c._id}
                type="button"
                title={c.title}
                aria-label={c.title}
                onClick={() => onSelect(c._id)}
                className={cn("relative shrink-0 rounded-[14px] p-0.5", selected ? "ring-2 ring-app-accent" : "hover:bg-app-field")}
              >
                {c.kind === "group" ? <GroupAvatar size={40} /> : <Avatar name={c.title} index={c.avatarIndex} size={40} />}
                {c.unread && (
                  <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-app-sidebar bg-app-accent" />
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label={t("side.addFriend")}
          title={t("side.addFriend")}
          onClick={onOpenInvite}
          className="relative flex size-10 items-center justify-center rounded-xl text-app-accent-text hover:bg-app-field"
        >
          <UserPlus className="size-5" strokeWidth={2} />
          {pendingRequests > 0 && (
            <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full border-2 border-app-sidebar bg-app-accent" />
          )}
        </button>
        <button
          type="button"
          aria-label={t("side.createGroup")}
          title={t("side.createGroup")}
          onClick={onOpenGroup}
          className="flex size-10 items-center justify-center rounded-xl text-app-accent-text hover:bg-app-field"
        >
          <UsersRound className="size-5" strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label={t("nav.settings")}
          title={t("nav.settings")}
          onClick={onOpenSettings}
          className="flex size-10 items-center justify-center rounded-xl text-app-text-muted hover:bg-app-field"
        >
          <Settings className="size-5" strokeWidth={1.8} />
        </button>
      </aside>
    );
  }

  // ---------- barra estesa ----------
  return (
    <aside ref={asideRef} className={asideClass} style={{ width }}>
      {handle}

      <div className="flex items-center gap-2 p-4">
        <div className="relative size-[46px] shrink-0">
          <Avatar name={me?.name ?? ""} index={0} size={46} accent />
          <span className="absolute -right-[3px] -bottom-[3px] size-3.5 rounded-full border-[3px] border-app-sidebar bg-app-online" />
        </div>
        <div className="mr-1 ml-1 min-w-0 flex-1">
          <div className="truncate text-base font-bold text-app-text-strong">{me?.name ?? "…"}</div>
          <div className="text-[13px] font-semibold text-app-online">{t("side.online")}</div>
        </div>
        <button
          type="button"
          aria-label={t("nav.settings")}
          title={t("nav.settings")}
          onClick={onOpenSettings}
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-app-text-muted hover:bg-app-field"
        >
          <Settings className="size-5" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label={t("sidebar.collapse")}
          title={t("sidebar.collapse")}
          onClick={() => setCollapsed(true)}
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-app-text-muted hover:bg-app-field"
        >
          <CollapseIcon className="size-5" strokeWidth={1.8} />
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
          const status = c.kind === "group" ? presence.group(c.memberCount, c.othersLastSeenAt) : presence.person(c.peerLastSeenAt);
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
              <span className="relative shrink-0">
                {c.kind === "group" ? <GroupAvatar /> : <Avatar name={c.title} index={c.avatarIndex} />}
                {status.online && (
                  <span className="absolute -right-[3px] -bottom-[3px] size-3.5 rounded-full border-[3px] border-app-sidebar bg-app-online" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[15px] font-bold",
                    selected || c.unread ? "text-app-text-strong" : "text-app-text",
                  )}
                >
                  {c.title}
                </span>
                <span className={cn("block truncate text-[13px]", status.online ? "font-semibold text-app-online" : "text-app-text-muted")}>
                  {status.text}
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

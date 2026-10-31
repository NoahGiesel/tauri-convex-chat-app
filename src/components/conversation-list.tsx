import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  ChevronDown,
  Hash,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Settings,
  UserPlus,
  UsersRound,
} from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "@/components/avatar";
import type { ConversationItem } from "@/components/chat-app";
import { SIDEBAR_MAX, SIDEBAR_MIN, SIDEBAR_RAIL, useSidebar } from "@/hooks/use-sidebar";
import { useI18n } from "@/i18n/i18n-provider";
import { usePresence, type PresenceStatus } from "@/lib/presence";
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
  me: { name: string; avatarIndex: number; avatarUrl: string | null } | null | undefined;
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

  const [closed, setClosed] = useState<Record<SectionId, boolean>>(readClosedSections);
  const toggleSection = (id: SectionId) =>
    setClosed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // storage non disponibile
      }
      return next;
    });

  const groups = visible.filter((c) => c.kind === "group");
  const directs = visible.filter((c) => c.kind === "direct");
  const searching = query.trim() !== "";

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
          <Avatar name={me?.name ?? ""} index={0} src={me?.avatarUrl} size={44} accent />
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
                {c.kind === "group" ? (
                  <span className="flex size-10 items-center justify-center rounded-xl bg-app-raised text-app-text-soft">
                    <Hash className="size-5" strokeWidth={2.2} />
                  </span>
                ) : (
                  <Avatar name={c.title} index={c.avatarIndex} src={c.peerAvatarUrl} size={40} />
                )}
                {c.unreadCount > 0 && <UnreadBadge count={c.unreadCount} className="absolute -top-1 -right-1 border-2 border-app-sidebar" />}
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
          <Avatar name={me?.name ?? ""} index={0} src={me?.avatarUrl} size={46} accent />
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
        {conversations && conversations.length > 0 && visible.length === 0 && (
          <p className="px-2 py-3 text-sm text-app-text-muted">{t("side.noResults")}</p>
        )}

        {conversations && (
          <>
            {(groups.length > 0 || !searching) && (
              <Section
                label={t("side.groups")}
                addLabel={t("side.createGroup")}
                onAdd={onOpenGroup}
                items={groups}
                emptyText={t("side.noGroups")}
                closed={closed.groups && !searching}
                onToggle={() => toggleSection("groups")}
                selectedIds={selectedIds}
                onSelect={onSelect}
                status={(c) => presence.group(c.memberCount, c.othersLastSeenAt)}
                unreadLabel={(count) => t("side.unread", { count })}
              />
            )}
            {(directs.length > 0 || !searching) && (
              <Section
                label={t("side.direct")}
                addLabel={t("side.addFriend")}
                onAdd={onOpenInvite}
                addDot={pendingRequests > 0}
                items={directs}
                emptyText={t("side.noDirect")}
                closed={closed.direct && !searching}
                onToggle={() => toggleSection("direct")}
                selectedIds={selectedIds}
                onSelect={onSelect}
                status={(c) => presence.person(c.peerLastSeenAt)}
                unreadLabel={(count) => t("side.unread", { count })}
              />
            )}
          </>
        )}
      </div>
    </aside>
  );
}

type SectionId = "groups" | "direct";
const SECTIONS_KEY = "chat:sections";

function readClosedSections(): Record<SectionId, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}") as Partial<Record<SectionId, boolean>>;
    return { groups: raw.groups === true, direct: raw.direct === true };
  } catch {
    return { groups: false, direct: false };
  }
}

/** Pillola col numero di messaggi non letti. */
function UnreadBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-app-accent px-1.5 text-xs leading-none font-extrabold text-app-accent-fg",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Sezione richiudibile della lista (Gruppi / Messaggi diretti). Da chiusa mostra solo le chat con novità. */
function Section({
  label,
  addLabel,
  onAdd,
  addDot,
  items,
  emptyText,
  closed,
  onToggle,
  selectedIds,
  onSelect,
  status,
  unreadLabel,
}: {
  label: string;
  addLabel: string;
  onAdd: () => void;
  addDot?: boolean;
  items: ConversationItem[];
  /** Mostrato quando la sezione è vuota (ad esempio per chi è appena arrivato). */
  emptyText: string;
  closed: boolean;
  onToggle: () => void;
  selectedIds: Set<Id<"conversations">>;
  onSelect: (id: Id<"conversations">) => void;
  status: (c: ConversationItem) => PresenceStatus;
  unreadLabel: (count: number) => string;
}) {
  const unreadTotal = items.reduce((sum, c) => sum + c.unreadCount, 0);
  const shown = closed ? items.filter((c) => c.unreadCount > 0 || selectedIds.has(c._id)) : items;

  return (
    <section className="pt-3">
      <div className="group flex items-center gap-1 px-1">
        <button
          type="button"
          aria-expanded={!closed}
          onClick={onToggle}
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-[15px] font-semibold text-app-text-muted hover:bg-app-field/60 hover:text-app-text"
        >
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", closed && "-rotate-90")} strokeWidth={2.4} />
          <span className="truncate">{label}</span>
          {closed && unreadTotal > 0 && <UnreadBadge count={unreadTotal} className="ml-auto" />}
        </button>
        <button
          type="button"
          aria-label={addLabel}
          title={addLabel}
          onClick={onAdd}
          className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-app-text-muted hover:bg-app-field hover:text-app-text"
        >
          <Plus className="size-4" strokeWidth={2.4} />
          {addDot && <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full border-2 border-app-sidebar bg-app-accent" />}
        </button>
      </div>

      <div className="mt-0.5 flex flex-col gap-px">
        {items.length === 0 && !closed && <p className="px-3.5 py-1.5 text-sm text-app-text-dim">{emptyText}</p>}
        {shown.map((c) => {
          const selected = selectedIds.has(c._id);
          const s = status(c);
          const unread = c.unreadCount > 0;
          return (
            <button
              key={c._id}
              type="button"
              title={`${c.title} · ${s.text}`}
              onClick={() => onSelect(c._id)}
              className={cn(
                "flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[15px] transition-colors",
                selected
                  ? "bg-app-accent font-semibold text-app-accent-fg"
                  : unread
                    ? "font-extrabold text-app-text-strong hover:bg-app-field/70"
                    : "text-app-text-soft hover:bg-app-field/70",
              )}
            >
              <span className="relative flex size-6 shrink-0 items-center justify-center">
                {c.kind === "group" ? (
                  <Hash className="size-[18px] opacity-80" strokeWidth={2.2} />
                ) : (
                  <>
                    <Avatar name={c.title} index={c.avatarIndex} src={c.peerAvatarUrl} size={24} />
                    <span
                      className={cn(
                        "absolute -right-[3px] -bottom-[3px] size-3 rounded-full border-2",
                        selected ? "border-app-accent" : "border-app-sidebar",
                        s.online ? "bg-app-online" : "bg-app-offline",
                      )}
                    />
                  </>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              {unread && (
                <span title={unreadLabel(c.unreadCount)} className="flex">
                  <UnreadBadge
                    count={c.unreadCount}
                    className={selected ? "bg-app-accent-fg text-app-accent" : undefined}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { useMessageNotifications } from "@/hooks/use-message-notifications";
import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar, GroupAvatar } from "@/components/avatar";
import { ConversationList } from "@/components/conversation-list";
import { ConversationView } from "@/components/conversation-view";
import { GroupModal } from "@/components/group-modal";
import { InviteModal } from "@/components/invite-modal";
import { useI18n } from "@/i18n/i18n-provider";
import { openChatWindow } from "@/lib/popout";
import { usePresence, usePresenceHeartbeat } from "@/lib/presence";
import { cn } from "@/lib/utils";

export type ConversationItem = NonNullable<FunctionReturnType<typeof api.conversations.list>>[number];

type ConversationId = Id<"conversations">;
type Side = "left" | "right";

/** Quanti pannelli affiancati al massimo. */
const MAX_PANES = 3;
/** Larghezza minima di un pannello, in pixel, quando si ridimensiona. */
const MIN_PANE_PX = 280;

/**
 * Pagina Chat: barra laterale, schede delle chat aperte e uno o più pannelli affiancati.
 * Per dividere la vista si trascina una scheda sulla metà sinistra o destra di una chat già aperta.
 */
export function ChatApp({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useI18n();
  usePresenceHeartbeat();
  const presence = usePresence();
  const me = useQuery(api.users.me);
  const conversations = useQuery(api.conversations.list);
  useMessageNotifications(conversations);
  const friends = useQuery(api.friends.list);

  const [tabs, setTabs] = useState<ConversationId[]>([]);
  /** Chat mostrate, da sinistra a destra. Sempre almeno un pannello (può essere vuoto). */
  const [panes, setPanes] = useState<(ConversationId | null)[]>([null]);
  const [focus, setFocus] = useState(0);
  const [modal, setModal] = useState<"invite" | "group" | null>(null);

  // trascinamento di una scheda
  const [dragId, setDragId] = useState<ConversationId | null>(null);
  const [hover, setHover] = useState<{ pane: number; side: Side } | null>(null);

  // Larghezze relative dei pannelli (flex-grow). Se il numero di pannelli cambia si torna a parti uguali.
  const [weights, setWeights] = useState<number[]>([1]);
  const sizes = weights.length === panes.length ? weights : panes.map(() => 1);
  const rowRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ index: number; startX: number; start: number[]; width: number } | null>(null);
  const [resizeIndex, setResizeIndex] = useState<number | null>(null);

  /** `index` è il pannello a destra del divisore trascinato. */
  function onDividerDown(e: PointerEvent<HTMLDivElement>, index: number) {
    if (e.button !== 0 || !rowRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizing.current = { index, startX: e.clientX, start: sizes, width: rowRef.current.getBoundingClientRect().width };
    setResizeIndex(index);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function onDividerMove(e: PointerEvent<HTMLDivElement>) {
    const r = resizing.current;
    if (!r) return;
    const total = r.start.reduce((a, b) => a + b, 0);
    const min = Math.min((MIN_PANE_PX / r.width) * total, total / r.start.length);
    const left = r.index - 1;
    const pair = r.start[left] + r.start[r.index];
    const delta = ((e.clientX - r.startX) / r.width) * total;
    const nextLeft = Math.min(Math.max(r.start[left] + delta, min), pair - min);
    setWeights(r.start.map((w, i) => (i === left ? nextLeft : i === r.index ? pair - nextLeft : w)));
  }

  function onDividerUp(e: PointerEvent<HTMLDivElement>) {
    if (!resizing.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    resizing.current = null;
    setResizeIndex(null);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  const split = panes.length > 1;
  const activeIndex = Math.min(focus, panes.length - 1);
  const byId = useMemo(() => new Map((conversations ?? []).map((c) => [c._id, c])), [conversations]);

  function openChat(id: ConversationId) {
    setTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    const existing = panes.indexOf(id);
    if (existing >= 0) {
      setFocus(existing); // già visibile: basta darle il focus
      return;
    }
    setPanes((prev) => prev.map((p, i) => (i === activeIndex ? id : p)));
  }

  function closeTab(id: ConversationId) {
    const index = tabs.indexOf(id);
    const remaining = tabs.filter((tab) => tab !== id);
    setTabs(remaining);
    if (!panes.includes(id)) return;

    if (panes.length > 1) {
      // il pannello sparisce e gli altri si allargano
      setPanes(panes.filter((p) => p !== id));
      setFocus(Math.min(activeIndex, panes.length - 2));
    } else {
      setPanes([remaining[index] ?? remaining[index - 1] ?? null]);
    }
  }

  /** Può la scheda trascinata essere rilasciata su questo pannello? */
  function canDropOn(paneIndex: number): boolean {
    const target = panes[paneIndex];
    if (!dragId || !target || target === dragId) return false;
    return panes.includes(dragId) || panes.length < MAX_PANES;
  }

  function dropTab(paneIndex: number, side: Side) {
    const target = panes[paneIndex];
    if (!dragId || !target || target === dragId) return;
    const without = panes.filter((p) => p !== dragId);
    const at = without.indexOf(target) + (side === "right" ? 1 : 0);
    const next = [...without];
    next.splice(at, 0, dragId);
    setPanes(next);
    setFocus(at);
  }

  function endDrag() {
    setDragId(null);
    setHover(null);
  }

  // Durante il trascinamento ricordiamo se il puntatore è uscito dalla finestra.
  const leftWindow = useRef(false);
  useEffect(() => {
    if (!dragId) return;
    leftWindow.current = false;
    const onLeave = (e: globalThis.DragEvent) => {
      if (e.relatedTarget === null) leftWindow.current = true;
    };
    const onInside = () => {
      leftWindow.current = false;
    };
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("dragenter", onInside);
    document.addEventListener("dragover", onInside);
    return () => {
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("dragenter", onInside);
      document.removeEventListener("dragover", onInside);
    };
  }, [dragId]);

  /** Scheda rilasciata fuori dalla finestra: la chat si apre in una finestra tutta sua. */
  function onTabDragEnd(e: DragEvent, id: ConversationId) {
    const outside =
      e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight;
    const popOut = e.dataTransfer.dropEffect === "none" && (leftWindow.current || outside);
    endDrag();
    if (!popOut) return;
    const title = byId.get(id)?.title ?? "Chat";
    void openChatWindow(id, title).then((opened) => {
      if (opened) closeTab(id);
    });
  }

  const selectedIds = new Set<ConversationId>(panes.filter((p): p is ConversationId => p !== null));

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
        {/* Schede delle chat aperte, con lo stato di chi c'è dentro: trascinale su un pannello per dividere la vista */}
        <div className="flex h-[58px] shrink-0 items-end gap-1 overflow-x-auto bg-app-bg px-2.5 pt-2.5">
          {tabs.map((id) => {
            const c = byId.get(id);
            if (!c) return null;
            const focused = id === panes[activeIndex];
            const shown = panes.includes(id);
            const status = c.kind === "group" ? presence.group(c.memberCount, c.othersLastSeenAt) : presence.person(c.peerLastSeenAt);
            return (
              <div
                key={id}
                draggable
                onDragStart={(e: DragEvent<HTMLDivElement>) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", c.title);
                  setDragId(id);
                }}
                onDragEnd={(e) => onTabDragEnd(e, id)}
                className={cn(
                  "group/tab flex h-12 max-w-[250px] min-w-[150px] shrink-0 cursor-grab items-center rounded-t-xl pr-1 pl-1 active:cursor-grabbing",
                  focused ? "bg-app-panel" : shown ? "bg-app-panel/50 hover:bg-app-panel/70" : "hover:bg-app-panel/30",
                  dragId === id && "opacity-40",
                )}
              >
                <button type="button" onClick={() => openChat(id)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 pr-1 pl-2 text-left">
                  <span className="relative shrink-0">
                    {c.kind === "group" ? <GroupAvatar size={30} /> : <Avatar name={c.title} index={c.avatarIndex} src={c.peerAvatarUrl} size={30} />}
                    {status.online && c.kind === "direct" && (
                      <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-app-panel bg-app-online" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13.5px] leading-tight", focused ? "font-bold text-app-text-strong" : "font-semibold text-app-text")}>
                      {c.title}
                    </span>
                    <span className={cn("block truncate text-[11.5px] leading-tight", status.online ? "font-semibold text-app-online" : "text-app-text-dim")}>
                      {status.text}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t("tabs.close", { name: c.title })}
                  onClick={() => closeTab(id)}
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md text-app-text-dim hover:bg-app-field hover:text-app-text",
                    !focused && "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100",
                  )}
                >
                  <X className="size-3.5" strokeWidth={2.4} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Pannelli affiancati */}
        <div ref={rowRef} className="flex min-h-0 flex-1">
          {panes.map((id, i) => (
            <div
              key={id ?? `empty-${i}`}
              onMouseDownCapture={() => setFocus(i)}
              style={{ flex: `${sizes[i]} 1 0%` }}
              className={cn("relative flex min-h-0 min-w-0 flex-col", i > 0 && "border-l border-app-border")}
            >
              {i > 0 && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t("layout.resize")}
                  onPointerDown={(e) => onDividerDown(e, i)}
                  onPointerMove={onDividerMove}
                  onPointerUp={onDividerUp}
                  onPointerCancel={onDividerUp}
                  onDoubleClick={() => setWeights(panes.map(() => 1))}
                  className={cn(
                    "absolute inset-y-0 -left-[3px] z-30 w-1.5 cursor-col-resize transition-colors hover:bg-app-accent/40",
                    resizeIndex === i && "bg-app-accent/60",
                    dragId && "pointer-events-none",
                  )}
                />
              )}
              {split && <div className={cn("h-[3px] shrink-0", activeIndex === i ? "bg-app-accent" : "bg-transparent")} />}
              {id ? (
                <ConversationView key={id} conversationId={id} />
              ) : (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-app-text-muted">
                  {t("chat.select")}
                </div>
              )}

              {/* Zone di rilascio: metà sinistra e metà destra, visibili solo durante il trascinamento */}
              {canDropOn(i) && (
                <div className="absolute inset-0 z-20 flex" onDragLeave={() => setHover(null)}>
                  {(["left", "right"] as Side[]).map((side) => {
                    const active = hover?.pane === i && hover.side === side;
                    return (
                      <div
                        key={side}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (!active) setHover({ pane: i, side });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          dropTab(i, side);
                          endDrag();
                        }}
                        className={cn(
                          "m-1.5 flex-1 rounded-xl border-2 border-dashed transition-colors",
                          active ? "border-app-accent bg-app-accent/25" : "border-app-border-strong/60 bg-app-bg/40",
                        )}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {modal === "invite" && <InviteModal onClose={() => setModal(null)} onOpenChat={openChat} />}
      {modal === "group" && <GroupModal onClose={() => setModal(null)} onOpenChat={openChat} />}
    </div>
  );
}

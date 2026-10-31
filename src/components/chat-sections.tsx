import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Folder, FolderPlus, Hash, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "@/components/avatar";
import type { ConversationItem } from "@/components/chat-app";
import { useI18n } from "@/i18n/i18n-provider";
import { usePresence } from "@/lib/presence";
import { cn } from "@/lib/utils";

type ChatId = Id<"conversations">;
type FolderData = { id: string; name: string; chatIds: ChatId[] };
type Layout = { folders: FolderData[]; order: string[]; chatOrder: ChatId[] };
type SectionKind = "groups" | "direct" | "folder";

interface SectionModel {
  id: string;
  kind: SectionKind;
  name: string;
  items: ConversationItem[];
}

type Drag = { type: "chat"; id: ChatId; kind: "group" | "direct" } | { type: "section"; id: string };
type Over =
  | { type: "section"; id: string }
  | { type: "section-pos"; id: string; pos: "before" | "after" }
  | { type: "row"; id: ChatId; sectionId: string; pos: "before" | "after" };

const MAX_FOLDERS = 20;
const MAX_FOLDER_NAME = 40;
const CLOSED_KEY = "chat:sections";

function readClosed(): Record<string, boolean> {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "{}") as unknown;
    return typeof raw === "object" && raw !== null ? (raw as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Pillola col numero di messaggi non letti. */
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
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

/** Gruppi, messaggi diretti e cartelle personali, nell'ordine scelto dall'utente. */
function buildSections(layout: Layout, conversations: ConversationItem[], names: { groups: string; direct: string }) {
  const byId = new Map(conversations.map((c) => [c._id, c]));
  const placed = new Set<ChatId>();

  // Fuori dalle cartelle vale l'ordine scelto a mano; le chat nuove (senza posizione) stanno in cima, per attività.
  const rank = new Map(layout.chatOrder.map((id, i) => [id, i]));
  const manual = (items: ConversationItem[]) => [
    ...items.filter((c) => !rank.has(c._id)),
    ...items.filter((c) => rank.has(c._id)).sort((a, b) => rank.get(a._id)! - rank.get(b._id)!),
  ];

  const folders: SectionModel[] = layout.folders.map((f) => {
    const items = f.chatIds.flatMap((id) => {
      const c = byId.get(id);
      if (!c || placed.has(id)) return [];
      placed.add(id);
      return [c];
    });
    return { id: f.id, kind: "folder", name: f.name, items };
  });

  const all: SectionModel[] = [
    { id: "groups", kind: "groups", name: names.groups, items: manual(conversations.filter((c) => c.kind === "group" && !placed.has(c._id))) },
    { id: "direct", kind: "direct", name: names.direct, items: manual(conversations.filter((c) => c.kind === "direct" && !placed.has(c._id))) },
    ...folders,
  ];

  const byKey = new Map(all.map((s) => [s.id, s]));
  const ordered = layout.order.flatMap((id) => {
    const s = byKey.get(id);
    byKey.delete(id);
    return s ? [s] : [];
  });
  return [...ordered, ...byKey.values()];
}

export function ChatSections({
  conversations,
  query,
  selectedIds,
  pendingRequests,
  onSelect,
  onOpenGroup,
  onOpenInvite,
}: {
  conversations: ConversationItem[];
  query: string;
  selectedIds: Set<ChatId>;
  pendingRequests: number;
  onSelect: (id: ChatId) => void;
  onOpenGroup: () => void;
  onOpenInvite: () => void;
}) {
  const { t } = useI18n();
  const presence = usePresence();

  const serverLayout = useQuery(api.sidebar.layout);
  const saveLayout = useMutation(api.sidebar.save).withOptimisticUpdate((store, args) => {
    store.setQuery(api.sidebar.layout, {}, { folders: args.folders, order: args.order, chatOrder: args.chatOrder });
  });

  const [closed, setClosed] = useState<Record<string, boolean>>(readClosed);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Over | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const needle = query.trim().toLocaleLowerCase();
  const searching = needle !== "";

  const layout = useMemo<Layout>(
    () => ({ folders: serverLayout?.folders ?? [], order: serverLayout?.order ?? [], chatOrder: serverLayout?.chatOrder ?? [] }),
    [serverLayout],
  );
  const sections = useMemo(
    () => buildSections(layout, conversations, { groups: t("side.groups"), direct: t("side.direct") }),
    [layout, conversations, t],
  );

  const toggle = (id: string) =>
    setClosed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
      } catch {
        // storage non disponibile
      }
      return next;
    });

  function persist(folders: FolderData[], order: string[], chatOrder: ChatId[] = layout.chatOrder) {
    saveLayout({ folders, order, chatOrder }).catch(() => {
      // l'aggiornamento ottimistico torna da solo allo stato del server
    });
  }
  const currentOrder = () => sections.map((s) => s.id);

  // ---- operazioni sul layout
  /** Sposta una chat in una cartella, o la riporta fuori; con `anchor` sceglie anche la posizione. */
  function moveChat(chatId: ChatId, dest: SectionModel, anchor?: { id: ChatId; pos: "before" | "after" }) {
    const folders = layout.folders.map((f) => ({ ...f, chatIds: f.chatIds.filter((id) => id !== chatId) }));
    let chatOrder = layout.chatOrder;

    if (dest.kind === "folder") {
      const folder = folders.find((f) => f.id === dest.id);
      if (folder) {
        const at = anchor ? folder.chatIds.indexOf(anchor.id) + (anchor.pos === "after" ? 1 : 0) : folder.chatIds.length;
        folder.chatIds.splice(at < 0 ? folder.chatIds.length : at, 0, chatId);
      }
    } else if (anchor) {
      // Riordino dentro Gruppi / Messaggi diretti: la nuova sequenza della sezione diventa il suo ordine manuale.
      const ids = dest.items.map((c) => c._id).filter((id) => id !== chatId);
      const at = ids.indexOf(anchor.id) + (anchor.pos === "after" ? 1 : 0);
      ids.splice(at < 0 ? ids.length : at, 0, chatId);
      const inSection = new Set(ids);
      chatOrder = [...ids, ...layout.chatOrder.filter((id) => !inSection.has(id))];
    }

    if (JSON.stringify(folders) === JSON.stringify(layout.folders) && JSON.stringify(chatOrder) === JSON.stringify(layout.chatOrder)) return;
    persist(folders, currentOrder(), chatOrder);
  }

  function moveSection(id: string, targetId: string, pos: "before" | "after") {
    const ids = currentOrder().filter((x) => x !== id);
    const at = ids.indexOf(targetId) + (pos === "after" ? 1 : 0);
    ids.splice(at < 0 ? ids.length : at, 0, id);
    persist(layout.folders, ids);
  }

  function createFolder() {
    if (layout.folders.length >= MAX_FOLDERS) return;
    const id = crypto.randomUUID();
    persist([...layout.folders, { id, name: t("side.newFolderName"), chatIds: [] }], [...currentOrder(), id]);
    setRenaming(id);
  }

  function renameFolder(id: string, name: string) {
    setRenaming(null);
    const clean = name.trim().slice(0, MAX_FOLDER_NAME);
    const folder = layout.folders.find((f) => f.id === id);
    if (!folder || !clean || clean === folder.name) return;
    persist(layout.folders.map((f) => (f.id === id ? { ...f, name: clean } : f)), currentOrder());
  }

  function deleteFolder(id: string) {
    persist(
      layout.folders.filter((f) => f.id !== id),
      currentOrder().filter((x) => x !== id),
    );
  }

  // ---- trascinamento
  function endDrag() {
    setDrag(null);
    setOver(null);
  }

  function sameOver(a: Over | null, b: Over) {
    return a !== null && JSON.stringify(a) === JSON.stringify(b);
  }

  function dropOn(section: SectionModel) {
    if (!drag || !over) return endDrag();
    if (drag.type === "section" && over.type === "section-pos") {
      moveSection(drag.id, over.id, over.pos);
    } else if (drag.type === "chat") {
      moveChat(drag.id, section, over.type === "row" ? { id: over.id, pos: over.pos } : undefined);
    }
    endDrag();
  }

  const visibleSections = sections
    .map((s) => ({ ...s, shown: needle ? s.items.filter((c) => c.title.toLocaleLowerCase().includes(needle)) : s.items }))
    .filter((s) => !searching || s.shown.length > 0);

  return (
    <>
      {visibleSections.map((s) => {
        const isFolder = s.kind === "folder";
        const isClosed = closed[s.id] === true && !searching;
        const unreadTotal = s.shown.reduce((sum, c) => sum + c.unreadCount, 0);
        const rows = isClosed ? s.shown.filter((c) => c.unreadCount > 0 || selectedIds.has(c._id)) : s.shown;
        const hovered = over?.type === "section" && over.id === s.id;
        const line = over?.type === "section-pos" && over.id === s.id ? over.pos : null;

        return (
          <section
            key={s.id}
            className={cn("relative pt-3", drag?.type === "section" && drag.id === s.id && "opacity-40")}
            onDragOver={(e) => {
              if (!drag || searching) return;
              if (drag.type === "section") {
                if (drag.id === s.id) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const next: Over = { type: "section-pos", id: s.id, pos: e.clientY < r.top + r.height / 2 ? "before" : "after" };
                if (!sameOver(over, next)) setOver(next);
              } else {
                e.preventDefault();
                const next: Over = { type: "section", id: s.id };
                if (!sameOver(over, next)) setOver(next);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              dropOn(s);
            }}
          >
            {line && (
              <div
                aria-hidden
                className={cn("pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded bg-app-accent", line === "before" ? "top-1" : "bottom-0")}
              />
            )}

            <div
              draggable={!searching && renaming !== s.id}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", s.name);
                setDrag({ type: "section", id: s.id });
              }}
              onDragEnd={endDrag}
              className={cn("group/head flex items-center gap-1 rounded-md px-1", hovered && "bg-app-accent-soft")}
            >
              {renaming === s.id ? (
                // Il campo di testo sta fuori dal pulsante: un input dentro un button non è valido e ruba i tasti.
                <div className="flex h-7 min-w-0 flex-1 items-center gap-1.5 px-1.5 text-app-text-muted">
                  <ChevronDown className="size-4 shrink-0" strokeWidth={2.4} />
                  <Folder className="size-4 shrink-0" strokeWidth={2} />
                  <FolderNameInput initial={s.name} onDone={(name) => renameFolder(s.id, name)} />
                </div>
              ) : (
                <button
                  type="button"
                  aria-expanded={!isClosed}
                  onClick={() => toggle(s.id)}
                  onDoubleClick={() => isFolder && setRenaming(s.id)}
                  className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-[15px] font-semibold text-app-text-muted hover:bg-app-field/60 hover:text-app-text"
                >
                  <ChevronDown className={cn("size-4 shrink-0 transition-transform", isClosed && "-rotate-90")} strokeWidth={2.4} />
                  {isFolder && <Folder className="size-4 shrink-0" strokeWidth={2} />}
                  <span className="truncate">{s.name}</span>
                  {isClosed && unreadTotal > 0 && <UnreadBadge count={unreadTotal} className="ml-auto" />}
                </button>
              )}

              {isFolder ? (
                <span className="flex shrink-0 opacity-0 transition-opacity group-hover/head:opacity-100 focus-within:opacity-100">
                  <IconButton label={t("side.renameFolder")} onClick={() => setRenaming(s.id)}>
                    <Pencil className="size-3.5" strokeWidth={2.2} />
                  </IconButton>
                  <IconButton label={t("side.deleteFolder")} onClick={() => deleteFolder(s.id)} danger>
                    <Trash2 className="size-3.5" strokeWidth={2.2} />
                  </IconButton>
                </span>
              ) : (
                <span className="flex shrink-0">
                  {s.kind === "direct" && layout.folders.length < MAX_FOLDERS && (
                    <IconButton label={t("side.newFolder")} onClick={createFolder}>
                      <FolderPlus className="size-4" strokeWidth={2.2} />
                    </IconButton>
                  )}
                  <IconButton
                    label={s.kind === "groups" ? t("side.createGroup") : t("side.addFriend")}
                    onClick={s.kind === "groups" ? onOpenGroup : onOpenInvite}
                    dot={s.kind === "direct" && pendingRequests > 0}
                  >
                    <Plus className="size-4" strokeWidth={2.4} />
                  </IconButton>
                </span>
              )}
            </div>

            <div className="mt-0.5 flex flex-col gap-px">
              {s.items.length === 0 && !isClosed && !searching && (
                <p className="px-3.5 py-1.5 text-sm text-app-text-dim">
                  {isFolder ? t("side.folderEmpty") : s.kind === "groups" ? t("side.noGroups") : t("side.noDirect")}
                </p>
              )}

              {rows.map((c) => {
                const selected = selectedIds.has(c._id);
                const status = c.kind === "group" ? presence.group(c.memberCount, c.othersLastSeenAt) : presence.person(c.peerLastSeenAt);
                const unread = c.unreadCount > 0;
                const rowLine = over?.type === "row" && over.id === c._id ? over.pos : null;

                return (
                  <div
                    key={c._id}
                    className={cn("relative", drag?.type === "chat" && drag.id === c._id && "opacity-40")}
                    onDragOver={(e) => {
                      if (drag?.type !== "chat" || drag.id === c._id || searching) return;
                      e.preventDefault();
                      e.stopPropagation(); // la riga decide da sola; la sezione gestisce intestazione e spazi vuoti
                      const r = e.currentTarget.getBoundingClientRect();
                      // Un gruppo si riordina tra i gruppi, una chat diretta tra le dirette; su una sezione "sbagliata" la chat esce solo dalla cartella.
                      const compatible = isFolder || (s.kind === "groups" ? drag.kind === "group" : drag.kind === "direct");
                      const next: Over = compatible
                        ? { type: "row", id: c._id, sectionId: s.id, pos: e.clientY < r.top + r.height / 2 ? "before" : "after" }
                        : { type: "section", id: s.id };
                      if (!sameOver(over, next)) setOver(next);
                    }}
                  >
                    {rowLine && (
                      <div
                        aria-hidden
                        className={cn("pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded bg-app-accent", rowLine === "before" ? "-top-px" : "-bottom-px")}
                      />
                    )}
                    <button
                      type="button"
                      draggable={!searching}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", c.title);
                        setDrag({ type: "chat", id: c._id, kind: c.kind });
                      }}
                      onDragEnd={endDrag}
                      title={`${c.title} · ${status.text}`}
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
                                status.online ? "bg-app-online" : "bg-app-offline",
                              )}
                            />
                          </>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      {unread && (
                        <span title={t("side.unread", { count: c.unreadCount })} className="flex">
                          <UnreadBadge count={c.unreadCount} className={selected ? "bg-app-accent-fg text-app-accent" : undefined} />
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger,
  dot,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative flex size-7 shrink-0 items-center justify-center rounded-md text-app-text-muted hover:bg-app-field",
        danger ? "hover:text-destructive" : "hover:text-app-text",
      )}
    >
      {children}
      {dot && <span className="absolute top-0.5 right-0.5 size-2.5 rounded-full border-2 border-app-sidebar bg-app-accent" />}
    </button>
  );
}

/** Campo per rinominare una cartella: Invio conferma, Esc annulla, perdere il focus conferma. */
function FolderNameInput({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const cancelled = useRef(false);
  return (
    <input
      autoFocus
      defaultValue={initial}
      maxLength={MAX_FOLDER_NAME}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(cancelled.current ? initial : e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className="min-w-0 flex-1 rounded border border-app-accent bg-app-bg px-1.5 py-0.5 text-[15px] font-semibold text-app-text outline-none"
    />
  );
}

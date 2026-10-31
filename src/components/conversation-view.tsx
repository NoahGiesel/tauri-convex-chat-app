import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Paperclip, Send, Smile, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "@/components/avatar";
import { EmojiGifPicker, type PickerTab } from "@/components/emoji-gif-picker";
import { MessageEditor } from "@/components/message-editor";
import { MessageBody, isEditableStyle } from "@/components/message-body";
import { ReactionChips, ReactionToolbar } from "@/components/message-reactions";
import { useI18n } from "@/i18n/i18n-provider";
import { usePresence } from "@/lib/presence";
import { errorKey } from "@/lib/errors";
import { fetchGifs } from "@/lib/giphy";
import { uploadFile } from "@/lib/media-upload";
import { classifyMedia, MEDIA_ACCEPT } from "../../convex/mediaRules";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;
const NEAR_BOTTOM_PX = 80;
const SAME_BLOCK_MS = 5 * 60 * 1000;

/** Comandi che si scrivono nel campo del messaggio, come `/giphy gatti`. */
const COMMANDS = [
  { name: "me", description: "composer.cmdMe" },
  { name: "code", description: "composer.cmdCode" },
  { name: "pre", description: "composer.cmdPre" },
  { name: "giphy", description: "composer.cmdGiphy" },
  { name: "spoiler", description: "composer.cmdSpoiler" },
  { name: "quote", description: "composer.cmdQuote" },
  { name: "random", description: "composer.cmdRandom" },
  { name: "flip", description: "composer.cmdFlip" },
] as const;

type TextStyle = "me" | "code" | "pre" | "spoiler" | "quote";
const TEXT_STYLES: readonly string[] = ["me", "code", "pre", "spoiler", "quote"];

export function ConversationView({ conversationId }: { conversationId: Id<"conversations"> }) {
  const { t, locale, language } = useI18n();
  const presence = usePresence();
  const info = useQuery(api.conversations.get, { conversationId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    { conversationId },
    { initialNumItems: PAGE_SIZE },
  );
  const sendMessage = useMutation(api.messages.send);
  const sendGif = useMutation(api.messages.sendGif);
  const createUpload = useAction(api.media.createUpload);
  const sendMedia = useMutation(api.messages.sendMedia);
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rollDice = useMutation(api.messages.roll);
  const flipCoin = useMutation(api.messages.flip);
  const [picked, setPicked] = useState({ prefix: "", index: 0 });
  const editMessage = useMutation(api.messages.edit);
  const removeMessage = useMutation(api.messages.remove);
  const markRead = useMutation(api.conversations.markRead);

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTab | null>(null);
  const [searchingGif, setSearchingGif] = useState(false);
  const [editingId, setEditingId] = useState<Id<"messages"> | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const pickerBoxRef = useRef<HTMLDivElement>(null);

  // Il selettore si chiude cliccando fuori o con Esc.
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: MouseEvent) => {
      if (pickerBoxRef.current && !pickerBoxRef.current.contains(e.target as Node)) setPicker(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicker(null);
        composerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [picker]);

  /** Inserisce l'emoji dove si trova il cursore. */
  function insertEmoji(emoji: string) {
    const el = composerRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft((d) => d.slice(0, start) + emoji + d.slice(end));
    requestAnimationFrame(() => {
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function saveEdit(id: Id<"messages">, body: string) {
    setError(null);
    try {
      await editMessage({ messageId: id, body });
      setEditingId(null);
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  async function deleteMessage(id: Id<"messages">) {
    setError(null);
    try {
      await removeMessage({ messageId: id });
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  async function submitGif(url: string) {
    setPicker(null);
    setError(null);
    stickToBottom.current = true;
    try {
      await sendGif({ conversationId, url });
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  // `results` è dal più recente al più vecchio: per la lettura si inverte.
  const messages = useMemo(() => [...results].reverse(), [results]);
  const newestId = results[0]?._id;
  const isGroup = info?.kind === "group";

  type Message = (typeof messages)[number];
  type Row = { type: "day"; key: string; label: string } | { type: "message"; message: Message; head: boolean };

  // Separatori di giorno + raggruppamento dei messaggi consecutivi dello stesso autore.
  const rows = useMemo<Row[]>(() => {
    const dayLabel = (ts: number) => {
      const d = new Date(ts);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString()) return t("chat.today");
      if (d.toDateString() === yesterday.toDateString()) return t("chat.yesterday");
      return d.toLocaleDateString(locale, { day: "numeric", month: "long" });
    };

    const out: Row[] = [];
    let prev: Message | undefined;
    for (const m of messages) {
      const day = new Date(m._creationTime).toDateString();
      const newDay = !prev || new Date(prev._creationTime).toDateString() !== day;
      if (newDay) out.push({ type: "day", key: day, label: dayLabel(m._creationTime) });
      const head =
        newDay ||
        !prev ||
        prev.authorId !== m.authorId ||
        // Testo e GIF della stessa persona restano nello stesso blocco; solo le risposte dell'AI ne iniziano uno nuovo.
        (prev.kind === "ai") !== (m.kind === "ai") ||
        m._creationTime - prev._creationTime > SAME_BLOCK_MS;
      out.push({ type: "message", message: m, head });
      prev = m;
    }
    return out;
  }, [messages, t, locale]);

  // --- scroll: resta in fondo se ci sei già, e non salta quando carichi messaggi più vecchi
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const heightBeforeLoadingOlder = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (heightBeforeLoadingOlder.current !== null) {
      el.scrollTop += el.scrollHeight - heightBeforeLoadingOlder.current;
      heightBeforeLoadingOlder.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, newestId]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  function loadOlder() {
    heightBeforeLoadingOlder.current = scrollRef.current?.scrollHeight ?? null;
    loadMore(PAGE_SIZE);
  }

  // --- segna come letto quando arriva qualcosa mentre guardi la chat
  useEffect(() => {
    if (!newestId) return;
    const markIfVisible = () => {
      if (document.visibilityState === "visible") void markRead({ conversationId });
    };
    markIfVisible();
    window.addEventListener("focus", markIfVisible);
    return () => window.removeEventListener("focus", markIfVisible);
  }, [newestId, conversationId, markRead]);

  // Scrivendo "/" compaiono i comandi disponibili; Invio o Tab completano il nome.
  const slash = /^\/(\w*)$/.exec(draft);
  const suggestions = slash ? COMMANDS.filter((c) => c.name.startsWith(slash[1].toLowerCase())) : [];
  const selected = slash && picked.prefix === slash[1] ? Math.min(picked.index, suggestions.length - 1) : 0;

  /** `/giphy testo`: cerca su GIPHY e invia una GIF a caso tra i risultati. */
  async function runGiphy(search: string) {
    if (!search) {
      setError(t("composer.giphyUsage"));
      return;
    }
    setError(null);
    setSearchingGif(true);
    try {
      const gifs = await fetchGifs(search, language, new AbortController().signal);
      if (gifs.length === 0) {
        setError(t("composer.gifEmpty"));
        return;
      }
      setDraft("");
      await submitGif(gifs[Math.floor(Math.random() * gifs.length)].url);
    } catch (e) {
      setError(e instanceof Error && e.message === "no_key" ? t("composer.gifNoKey") : t("composer.gifError"));
    } finally {
      setSearchingGif(false);
    }
  }

  /** Allegato: foto o video, caricato direttamente su Cloudflare R2. */
  async function sendFile(file: File) {
    if (upload) return;
    const check = classifyMedia(file.type, file.size);
    if (!check.ok) {
      setError(t(`error.${check.reason}`));
      return;
    }
    setError(null);
    stickToBottom.current = true;
    setUpload({ name: file.name, percent: 0 });
    try {
      const { key, uploadUrl } = await createUpload({ conversationId, mime: file.type, size: file.size });
      await uploadFile(uploadUrl, file, (percent) => setUpload({ name: file.name, percent }));
      await sendMedia({ conversationId, key, mime: file.type, size: file.size, name: file.name });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("upload_failed")) {
        console.error(e.message, "origin:", window.location.origin);
        setError(`${t("composer.uploadFailed")} (${e.message.slice("upload_failed:".length)}; ${window.location.origin})`);
      } else {
        setError(t(errorKey(e)));
      }
    } finally {
      setUpload(null);
    }
  }

  /** Invia con `action`; se fallisce rimette il testo nel campo. */
  async function post(action: () => Promise<unknown>, restore: string) {
    setDraft("");
    setError(null);
    stickToBottom.current = true;
    try {
      await action();
    } catch (e) {
      setDraft(restore); // non perdere quello che avevi scritto
      setError(t(errorKey(e)));
    }
  }

  async function submit() {
    const body = draft.trim();
    if (!body || searchingGif) return;

    const parsed = /^\/(\w+)(?:\s+([\s\S]*))?$/.exec(body);
    const name = parsed?.[1].toLowerCase();
    const arg = (parsed?.[2] ?? "").trim();

    if (name === "giphy") {
      void runGiphy(arg);
      return;
    }
    if (name && TEXT_STYLES.includes(name)) {
      if (!arg) {
        setError(t("composer.commandNeedsText"));
        return;
      }
      await post(() => sendMessage({ conversationId, body: arg, style: name as TextStyle }), body);
      return;
    }
    if (name === "random") {
      let min = 1;
      let max = 100;
      if (arg) {
        const range = /^(-?\d+)\s*-\s*(-?\d+)$/.exec(arg);
        if (range) {
          min = Number(range[1]);
          max = Number(range[2]);
        } else if (/^\d+$/.test(arg)) {
          max = Number(arg);
        } else {
          setError(t("composer.randomUsage"));
          return;
        }
      }
      await post(() => rollDice({ conversationId, min, max }), body);
      return;
    }
    if (name === "flip") {
      await post(() => flipCoin({ conversationId }), body);
      return;
    }
    // Comando sconosciuto: si invia come testo normale.
    await post(() => sendMessage({ conversationId, body }), body);
  }

  // Freccia su/giù con il campo vuoto: scorre gli ultimi 10 messaggi di testo che hai inviato.
  const historyPos = useRef(-1); // -1 = non stai scorrendo
  const draftBeforeHistory = useRef("");
  const sentHistory = useMemo(
    () =>
      results
        .filter((m) => m.mine && m.kind === "text" && m.style !== "random" && m.style !== "flip")
        .slice(0, 10)
        .map((m) => (m.style ? `/${m.style} ${m.body}` : m.body)),
    [results],
  );

  function browseHistory(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const up = e.key === "ArrowUp";
    if ((!up && e.key !== "ArrowDown") || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || e.nativeEvent.isComposing) return false;
    const browsing = historyPos.current >= 0;
    if (!browsing && (!up || draft !== "")) return false; // si parte solo dal campo vuoto
    if (browsing && draft.includes("\n")) return false; // testo su più righe: la freccia muove il cursore
    if (up) {
      if (sentHistory.length === 0) return false;
      if (!browsing) draftBeforeHistory.current = draft;
      historyPos.current = Math.min(historyPos.current + 1, sentHistory.length - 1);
      setDraft(sentHistory[historyPos.current]);
    } else {
      historyPos.current -= 1;
      setDraft(historyPos.current >= 0 ? sentHistory[historyPos.current] : draftBeforeHistory.current);
    }
    e.preventDefault();
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0 && !e.nativeEvent.isComposing) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        const index = (selected + step + suggestions.length) % suggestions.length;
        setPicked({ prefix: slash?.[1] ?? "", index });
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
        e.preventDefault();
        setDraft(`/${suggestions[selected].name} `);
        return;
      }
    }
    if (suggestions.length === 0 && browseHistory(e)) return;
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      historyPos.current = -1;
      void submit();
    }
  }

  const time = (ts: number) => new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-app-border px-6 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-extrabold text-app-text-strong">{info?.title ?? "…"}</h2>
          {info && (() => {
            const others = info.members.filter((m) => m._id !== info.myProfileId);
            const s = isGroup
              ? presence.group(info.members.length, others.flatMap((m) => (m.lastSeenAt !== undefined ? [m.lastSeenAt] : [])))
              : presence.person(others[0]?.lastSeenAt);
            const bio = isGroup ? null : others[0]?.bio;
            return (
              <>
                <p className={cn("text-[13px]", s.online ? "font-semibold text-app-online" : "text-app-text-muted")}>{s.text}</p>
                {bio && <p className="truncate text-[13px] text-app-text-muted">{bio}</p>}
              </>
            );
          })()}
        </div>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {status === "CanLoadMore" && (
          <div className="flex justify-center pb-3">
            <button
              type="button"
              onClick={loadOlder}
              className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-app-accent-text hover:bg-app-field"
            >
              {t("chat.loadOlder")}
            </button>
          </div>
        )}

        {status === "Exhausted" && messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-app-text-muted">{t("chat.noMessages")}</p>
        )}

        {rows.map((row) => {
          if (row.type === "day") {
            return (
              <div
                key={`day-${row.key}`}
                className="my-3 flex items-center gap-3 text-xs font-bold tracking-wide text-app-text-dim uppercase first:mt-0"
              >
                <span className="h-px flex-1 bg-app-border" />
                {row.label}
                <span className="h-px flex-1 bg-app-border" />
              </div>
            );
          }

          const m = row.message;
          const isAi = m.kind === "ai";

          return (
            <div
              key={m._id}
              className={cn("group relative flex gap-3", row.head ? "mt-[18px]" : "mt-0.5")}
            >
              <div className="relative w-[38px] shrink-0">
                {/* Nei messaggi consecutivi l'orario compare al passaggio del mouse, nello spazio dell'avatar. */}
                {!row.head && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 hidden text-center text-[11px] leading-[22px] text-app-text-dim group-hover:block">
                    {time(m._creationTime)}
                  </span>
                )}
                {row.head &&
                  (isAi ? (
                    <span className="flex size-[38px] items-center justify-center rounded-[11px] bg-app-ai-bg text-app-ai">
                      <Sparkles className="size-5" strokeWidth={1.8} />
                    </span>
                  ) : (
                    <Avatar name={m.authorName} index={m.authorAvatarIndex} src={m.authorAvatarUrl} size={38} accent={m.mine} />
                  ))}
              </div>
              {editingId !== m._id && (
                <ReactionToolbar
                  messageId={m._id}
                  onError={setError}
                  onEdit={m.mine && m.kind === "text" && isEditableStyle(m.style) ? () => setEditingId(m._id) : undefined}
                  onDelete={m.mine && m.kind !== "ai" ? () => void deleteMessage(m._id) : undefined}
                />
              )}
              <div className="min-w-0 flex-1">
                {row.head && (
                  <div className="text-sm">
                    <strong className={isAi ? "text-app-ai" : m.mine ? "text-app-accent-text" : "text-app-text-strong"}>
                      {isAi ? t("chat.aiName") : m.authorName}
                    </strong>
                    <span className="ml-1.5 text-xs text-app-text-dim">{time(m._creationTime)}</span>
                  </div>
                )}
                {isAi ? (
                  <div className="mt-2 max-w-[560px] rounded-[14px] border border-app-ai-border bg-app-ai-bg px-3.5 py-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-app-text">
                    {m.body}
                  </div>
                ) : m.kind === "media" && m.media ? (
                  m.media.type === "image" ? (
                    <img
                      src={m.media.url}
                      alt={m.body}
                      loading="lazy"
                      onLoad={() => {
                        if (stickToBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                      }}
                      className="mt-1 max-h-80 max-w-[min(420px,100%)] rounded-xl"
                    />
                  ) : (
                    <video
                      src={m.media.url}
                      controls
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={() => {
                        if (stickToBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                      }}
                      className="mt-1 max-h-80 max-w-[min(420px,100%)] rounded-xl bg-black"
                    />
                  )
                ) : m.kind === "gif" ? (
                  <img
                    src={m.body}
                    alt={t("chat.gifAlt")}
                    loading="lazy"
                    onLoad={() => {
                      // L'immagine cambia l'altezza dopo il caricamento: se eri in fondo, resta in fondo.
                      if (stickToBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                    }}
                    className="mt-1 max-h-60 max-w-[min(320px,100%)] rounded-xl"
                  />
                ) : (
                  editingId === m._id ? (
                    <MessageEditor
                      initial={m.body}
                      onSave={(body) => void saveEdit(m._id, body)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <MessageBody
                      style={m.style}
                      body={m.body}
                      authorName={m.authorName}
                      edited={!!m.editedAt}
                      className={row.head ? "mt-[3px]" : undefined}
                    />
                  )
                )}
                <ReactionChips messageId={m._id} reactions={m.reactions} onError={setError} />
              </div>
            </div>
          );
        })}
      </div>

      <footer className="shrink-0 px-6 pb-5">
        {upload && (
          <p className="pb-2 text-sm text-app-text-muted">
            {t("composer.uploading")} {upload.name} · {upload.percent}%
          </p>
        )}
        {searchingGif && <p className="pb-2 text-sm text-app-text-muted">{t("composer.giphySearching")}</p>}
        {error && (
          <p role="alert" className="pb-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="relative flex items-end gap-1 rounded-2xl border border-app-border bg-app-bg p-1.5">
          {suggestions.length > 0 && (
            <div role="listbox" className="absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border border-app-border-strong bg-app-panel p-1 shadow-xl">
              {suggestions.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  role="option"
                  aria-selected={i === selected}
                  onMouseDown={(e) => {
                    e.preventDefault(); // il campo di testo non perde il focus
                    setDraft(`/${c.name} `);
                  }}
                  className={cn(
                    "flex w-full items-baseline gap-1.5 rounded-lg px-3 py-2 text-left text-sm",
                    i === selected ? "bg-app-accent-soft" : "hover:bg-app-field",
                  )}
                >
                  <strong className="text-app-text-strong">/{c.name}:</strong>
                  <span className="min-w-0 truncate text-app-text-muted">{t(c.description)}</span>
                </button>
              ))}
            </div>
          )}
          {picker && (
            <div ref={pickerBoxRef} className="absolute right-0 bottom-full z-40 mb-2">
              <EmojiGifPicker
                tab={picker}
                onTab={setPicker}
                onEmoji={insertEmoji}
                onGif={(url) => void submitGif(url)}
              />
            </div>
          )}
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => {
              historyPos.current = -1;
              setDraft(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              const file = e.clipboardData.files[0];
              if (file) {
                e.preventDefault();
                void sendFile(file);
              }
            }}
            rows={1}
            aria-label={t("chat.composer")}
            placeholder={t("chat.composer")}
            className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-[11px] text-[15px] text-app-text outline-none placeholder:text-app-text-dim"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={MEDIA_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // permette di scegliere di nuovo lo stesso file
              if (file) void sendFile(file);
            }}
          />
          <button
            type="button"
            aria-label={t("composer.attach")}
            title={t("composer.attach")}
            disabled={!!upload}
            onClick={() => fileInputRef.current?.click()}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-app-text-muted hover:bg-app-field hover:text-app-text disabled:opacity-40"
          >
            <Paperclip className="size-5" strokeWidth={1.9} />
          </button>
          <button
            type="button"
            aria-label={t("composer.emoji")}
            title={t("composer.emoji")}
            aria-expanded={picker === "emoji"}
            onClick={() => setPicker(picker === "emoji" ? null : "emoji")}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl text-app-text-muted hover:bg-app-field hover:text-app-text",
              picker === "emoji" && "bg-app-field text-app-text",
            )}
          >
            <Smile className="size-5" strokeWidth={1.9} />
          </button>
          <button
            type="button"
            aria-label="GIF"
            title="GIF"
            aria-expanded={picker === "gif"}
            onClick={() => setPicker(picker === "gif" ? null : "gif")}
            className={cn(
              "flex h-11 shrink-0 items-center justify-center rounded-xl px-2 text-[13px] font-extrabold tracking-wide text-app-text-muted hover:bg-app-field hover:text-app-text",
              picker === "gif" && "bg-app-field text-app-text",
            )}
          >
            GIF
          </button>
          <button
            type="button"
            aria-label={t("chat.send")}
            onClick={() => void submit()}
            disabled={draft.trim().length === 0}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-app-accent text-app-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send className="size-5" strokeWidth={2} />
          </button>
        </div>
      </footer>
    </>
  );
}

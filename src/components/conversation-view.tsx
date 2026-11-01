import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { insertAtTop, useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { ArrowDown, Film, Images, Loader2, Maximize2, Paperclip, Send, Smile, Sparkles, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "@/components/avatar";
import { EmojiGifPicker, type PickerTab } from "@/components/emoji-gif-picker";
import { MediaLightbox, type LightboxItem } from "@/components/media-lightbox";
import { LinkPreview } from "@/components/link-preview";
import { MediaLibrary } from "@/components/media-library";
import { ProfileModal } from "@/components/profile-modal";
import { MinimizableMedia } from "@/components/minimizable-media";
import { AskCard } from "@/components/ask-card";
import { SummaryCard } from "@/components/summary-card";
import { MessageEditor } from "@/components/message-editor";
import { Markdown, MessageBody, isEditableStyle } from "@/components/message-body";
import { ReactionChips, ReactionToolbar } from "@/components/message-reactions";
import { useI18n } from "@/i18n/i18n-provider";
import { usePresence } from "@/lib/presence";
import { errorKey } from "@/lib/errors";
import { fetchGifs } from "@/lib/giphy";
import { compressImage } from "@/lib/image-compress";
import { dayLabel } from "@/lib/day-label";
import { splitLinks } from "@/lib/links";
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
  { name: "ask", description: "composer.cmdAsk" },
] as const;

type TextStyle = "me" | "code" | "pre" | "spoiler" | "quote";
const MAX_ATTACHMENTS = 10;
interface PendingFile {
  id: string;
  file: File;
  previewUrl: string | null;
}
const TEXT_STYLES: readonly string[] = ["me", "code", "pre", "spoiler", "quote"];

/**
 * `showHeader`: barra con nome e stato in cima (serve nelle finestre staccate, che non hanno le schede);
 * nella finestra principale nome e stato stanno già nella scheda, e il pulsante Media è sovrapposto alla lista.
 */
export function ConversationView({ conversationId, showHeader = false }: { conversationId: Id<"conversations">; showHeader?: boolean }) {
  const { t, locale, language } = useI18n();
  const presence = usePresence();
  const [profileId, setProfileId] = useState<Id<"profiles"> | null>(null);
  const typingRows = useQuery(api.typing.list, { conversationId });
  const pingTyping = useMutation(api.typing.ping);
  const lastPing = useRef(0);
  const [tick, setTick] = useState(() => Date.now());
  const typingNames = (typingRows ?? []).filter((r) => r.until > tick).map((r) => r.name);
  useEffect(() => {
    if (!typingRows || typingRows.length === 0) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    setTick(Date.now());
    return () => clearInterval(id);
  }, [typingRows]);
  const info = useQuery(api.conversations.get, { conversationId });
  const lastSeenByProfile = new Map<string, number | undefined>((info?.members ?? []).map((mb) => [mb._id as string, mb.lastSeenAt]));
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    { conversationId },
    { initialNumItems: PAGE_SIZE },
  );
  // Aggiornamento ottimistico: il messaggio compare subito nella lista e viene sostituito da quello vero
  // appena il server risponde (se il server lo rifiuta sparisce da solo e il testo torna nel campo).
  const myProfile = useQuery(api.users.me);
  const showOptimistically = (store: OptimisticLocalStore, kind: "text" | "gif", body: string, style: "me" | "code" | "pre" | "spoiler" | "quote" | null, gifQuery: string | null = null) => {
    if (!myProfile) return;
    insertAtTop({
      paginatedQuery: api.messages.list,
      argsToMatch: { conversationId },
      localQueryStore: store,
      item: {
        _id: crypto.randomUUID() as Id<"messages">, // provvisorio: gli id veri non contengono "-"
        _creationTime: Date.now(),
        kind,
        body,
        authorId: myProfile._id,
        authorName: myProfile.name,
        authorAvatarIndex: myProfile.avatarIndex,
        authorAvatarUrl: myProfile.avatarUrl,
        mine: true,
        reactions: [],
        editedAt: null,
        style,
        gifQuery,
        summarizable: false,
        summarized: false,
        summaryOf: null,
        summarySource: null,
        askStatus: null,
        summaryStatus: null,
        attachments: [],
      },
    });
  };
  const sendMessage = useMutation(api.messages.send).withOptimisticUpdate((store, args) =>
    showOptimistically(store, "text", args.body.trim(), args.style ?? null),
  );
  const sendGif = useMutation(api.messages.sendGif).withOptimisticUpdate((store, args) =>
    showOptimistically(store, "gif", args.url, null, args.query?.trim() || null),
  );
  const createUpload = useAction(api.media.createUpload);
  const sendAttachments = useMutation(api.messages.sendAttachments);
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Un'anteprima che compare cambia l'altezza: se eri in fondo alla chat, resti in fondo.
  const keepBottom = useCallback(() => {
    if (stickToBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);
  const rollDice = useMutation(api.messages.roll);
  const flipCoin = useMutation(api.messages.flip);
  const [picked, setPicked] = useState({ prefix: "", index: 0 });
  const editMessage = useMutation(api.messages.edit);
  const removeMessage = useMutation(api.messages.remove);
  const markRead = useMutation(api.conversations.markRead);

  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (draft.trim() === "") {
      if (lastPing.current !== 0) {
        lastPing.current = 0;
        void pingTyping({ conversationId, active: false }).catch(() => {});
      }
      return;
    }
    if (draft.startsWith("/")) return;
    const now = Date.now();
    if (now - lastPing.current > 3000) {
      lastPing.current = now;
      void pingTyping({ conversationId, active: true }).catch(() => {});
    }
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTab | null>(null);
  const [searchingGif, setSearchingGif] = useState(false);
  const [editingId, setEditingId] = useState<Id<"messages"> | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const pickerBoxRef = useRef<HTMLDivElement>(null);

  // Entrando in una chat il cursore è già nel campo di scrittura.
  useEffect(() => {
    composerRef.current?.focus({ preventScroll: true });
  }, [conversationId]);

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

  const askAction = useAction(api.ask.ask);
  const summarizeAction = useAction(api.summary.summarize);
  const [summarizing, setSummarizing] = useState<Set<string>>(new Set());
  async function summarize(id: Id<"messages">) {
    setError(null);
    setSummarizing((prev) => new Set(prev).add(id));
    try {
      await summarizeAction({ messageId: id, language });
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setSummarizing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

  async function submitGif(url: string, query?: string) {
    setPicker(null);
    setError(null);
    stickToBottom.current = true;
    try {
      await sendGif({ conversationId, url, query });
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
    const now = Date.now();
    const words = { today: t("chat.today"), yesterday: t("chat.yesterday"), locale };

    const out: Row[] = [];
    let prev: Message | undefined;
    for (const m of messages) {
      const day = new Date(m._creationTime).toDateString();
      const newDay = !prev || new Date(prev._creationTime).toDateString() !== day;
      if (newDay) out.push({ type: "day", key: day, label: dayLabel(m._creationTime, now, words) });
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

  // Aprendo una chat si parte dall'ultimo messaggio e ci si resta mentre il contenuto cambia altezza
  // (immagini, video e anteprime che si caricano dopo): finché non scorri verso l'alto.
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (el && el.clientHeight > 0 && stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Aprendo una chat la lista resta invisibile finché le foto e i video che si vedono in fondo non sono caricati
  // (al massimo 3 secondi); solo allora scorre all'ultimo messaggio e si mostra, senza salti visibili.
  const [revealed, setRevealed] = useState(false);
  const [awayFromBottom, setAwayFromBottom] = useState(false); // scrollato in alto: compare "vai all'ultimo messaggio"
  useEffect(() => {
    if (revealed || status === "LoadingFirstPage") return;
    const el = scrollRef.current;
    if (!el) return;
    let cancelled = false;
    void (async () => {
      el.scrollTop = el.scrollHeight;
      const view = el.getBoundingClientRect();
      const waiting = [...el.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video")].filter((node) => {
        const loaded = node instanceof HTMLImageElement ? node.complete : node.readyState >= 1;
        const r = node.getBoundingClientRect();
        return !loaded && r.bottom > view.top - 200 && r.top < view.bottom + 200;
      });
      const loads = waiting.map(
        (node) =>
          new Promise<void>((resolve) => {
            node.addEventListener(node instanceof HTMLImageElement ? "load" : "loadedmetadata", () => resolve(), { once: true });
            node.addEventListener("error", () => resolve(), { once: true });
          }),
      );
      await Promise.race([Promise.all(loads), new Promise<void>((resolve) => window.setTimeout(resolve, 3000))]);
      if (cancelled) return;
      stickToBottom.current = true;
      el.scrollTop = el.scrollHeight;
      setRevealed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, revealed]);

  // Un elemento nascosto (display: none) perde la posizione di scorrimento: la ricordiamo mentre l'elenco "Media e link" è aperto.
  const savedScrollTop = useRef(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (libraryOpen || !el) return;
    el.scrollTop = stickToBottom.current ? el.scrollHeight : savedScrollTop.current;
  }, [libraryOpen]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0) return; // nascosto: nessun dato di scorrimento valido
    savedScrollTop.current = el.scrollTop;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = fromBottom < NEAR_BOTTOM_PX;
    setAwayFromBottom(fromBottom > 300);
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
      await submitGif(gifs[Math.floor(Math.random() * gifs.length)].url, search);
    } catch (e) {
      setError(e instanceof Error && e.message === "no_key" ? t("composer.gifNoKey") : t("composer.gifError"));
    } finally {
      setSearchingGif(false);
    }
  }

  /** Allegato: foto o video, caricato direttamente su Cloudflare R2. */
  // Foto e video scelti o incollati restano nel campo di scrittura finché non premi Invio.
  const [pending, setPending] = useState<PendingFile[]>([]);
  const pendingRef = useRef<PendingFile[]>([]);
  pendingRef.current = pending;
  useEffect(
    () => () => {
      for (const p of pendingRef.current) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    },
    [],
  );

  function stageFiles(files: File[]) {
    const next: PendingFile[] = [];
    let problem: string | null = null;
    for (const file of files) {
      if (pending.length + next.length >= MAX_ATTACHMENTS) {
        problem = t("error.too_many_attachments");
        break;
      }
      const check = classifyMedia(file.type, file.size);
      if (!check.ok) {
        problem = t(`error.${check.reason}`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, previewUrl: check.type === "image" ? URL.createObjectURL(file) : null });
    }
    setError(problem);
    if (next.length > 0) setPending((p) => [...p, ...next]);
    composerRef.current?.focus();
  }

  function unstage(id: string) {
    setPending((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return p.filter((x) => x.id !== id);
    });
  }

  /** Carica gli allegati su R2 (foto ricompresse) e li invia in un solo messaggio con il testo come didascalia. */
  async function sendWithAttachments(caption: string) {
    const staged = pending;
    setError(null);
    stickToBottom.current = true;
    let target = "";
    try {
      const files: { key: string; mime: string; size: number; name: string }[] = [];
      for (const [i, p] of staged.entries()) {
        const label = staged.length > 1 ? `${i + 1}/${staged.length} ${p.file.name}` : p.file.name;
        setUpload({ name: label, percent: 0 });
        const first = classifyMedia(p.file.type, p.file.size);
        // Le foto vengono ricompresse (qualità 70%) per risparmiare spazio; i video restano com'erano.
        const file = first.ok && first.type === "image" ? await compressImage(p.file) : p.file;
        const check = classifyMedia(file.type, file.size);
        if (!check.ok) throw new Error(`media:${check.reason}`);
        const { key, uploadUrl } = await createUpload({ conversationId, mime: file.type, size: file.size });
        target = new URL(uploadUrl).host;
        await uploadFile(uploadUrl, file, (percent) => setUpload({ name: label, percent }));
        files.push({ key, mime: file.type, size: file.size, name: file.name });
      }
      await sendAttachments({ conversationId, body: caption, files });
      for (const p of staged) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      setPending([]);
      setDraft("");
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("upload_failed")) {
        console.error(e.message, "origin:", window.location.origin);
        setError(`${t("composer.uploadFailed")} (${e.message.slice("upload_failed:".length)}; ${window.location.origin} → ${target})`);
      } else if (e instanceof Error && e.message.startsWith("media:")) {
        setError(t(e.message === "media:media_too_large" ? "error.media_too_large" : "error.media_type"));
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
    if ((!body && pending.length === 0) || searchingGif || upload) return;

    // Con degli allegati nel campo, il testo diventa la didascalia (anche se inizia con "/").
    if (pending.length > 0) {
      await sendWithAttachments(body);
      return;
    }

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
    if (name === "ask") {
      if (!arg) {
        setError(t("composer.commandNeedsText"));
        return;
      }
      // La risposta può metterci qualche secondo: il campo si libera subito e l'attesa si vede in chat.
      setDraft("");
      setError(null);
      stickToBottom.current = true;
      void askAction({ conversationId, prompt: arg, language }).catch((e) => {
        setError(t(errorKey(e)));
      });
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
      {showHeader && (
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-app-border px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <h2 className="max-w-[50%] shrink-0 truncate text-[15px] font-extrabold text-app-text-strong">{info?.title ?? "…"}</h2>
          {info && (() => {
            const others = info.members.filter((m) => m._id !== info.myProfileId);
            const s = isGroup
              ? presence.group(info.members.length, others.flatMap((m) => (m.lastSeenAt !== undefined ? [m.lastSeenAt] : [])))
              : presence.person(others[0]?.lastSeenAt);
            const bio = isGroup ? null : others[0]?.bio;
            return (
              <>
                <span className={cn("shrink-0 text-xs", s.online ? "font-semibold text-app-online" : "text-app-text-muted")}>{s.text}</span>
                {bio && <span className="min-w-0 truncate text-xs text-app-text-dim">· {bio}</span>}
              </>
            );
          })()}
        </div>
        <button
          type="button"
          aria-label={t("library.open")}
          title={t("library.open")}
          aria-pressed={libraryOpen}
          onClick={() => setLibraryOpen((o) => !o)}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg text-app-text-muted hover:bg-app-field hover:text-app-text",
            libraryOpen && "bg-app-field text-app-text",
          )}
        >
          <Images className="size-[18px]" strokeWidth={1.9} />
        </button>
      </header>
      )}

      {profileId && <ProfileModal profileId={profileId} onClose={() => setProfileId(null)} />}
      {libraryOpen && <MediaLibrary conversationId={conversationId} onOpenMedia={setLightbox} onClose={() => setLibraryOpen(false)} />}

      {/* Messaggi e campo di scrittura restano montati (così non si perde la posizione) ma nascosti mentre si guarda l'elenco. */}
      <div className={cn("flex min-h-0 flex-1 flex-col", libraryOpen && "hidden")}>
      <div ref={scrollRef} onScroll={onScroll} className={cn("min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-3", !revealed && "opacity-0")}>
        {!showHeader && (
          <div className="pointer-events-none sticky top-0 z-10 h-0">
            <button
              type="button"
              aria-label={t("library.open")}
              title={t("library.open")}
              onClick={() => setLibraryOpen(true)}
              className="pointer-events-auto absolute top-0 right-0 flex size-9 items-center justify-center rounded-full border border-app-border bg-app-panel/90 text-app-text-muted shadow-md backdrop-blur hover:bg-app-field hover:text-app-text"
            >
              <Images className="size-[18px]" strokeWidth={1.9} />
            </button>
          </div>
        )}
        <div ref={contentRef}>
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
                    <span className="flex size-[38px] items-center justify-center rounded-[calc(11px*var(--radius-scale))] bg-app-ai-bg text-app-ai">
                      <Sparkles className="size-5" strokeWidth={1.8} />
                    </span>
                  ) : (
                    <button type="button" disabled={!m.authorId} onClick={() => m.authorId && setProfileId(m.authorId)} className="cursor-pointer rounded-[calc(11px*var(--radius-scale))]">
                      <Avatar name={m.authorName} index={m.authorAvatarIndex} src={m.authorAvatarUrl} size={38} accent={m.mine} />
                    </button>
                  ))}
              </div>
              {editingId !== m._id && !m._id.includes("-") && (
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
                    <strong onClick={() => !isAi && m.authorId && setProfileId(m.authorId)} className={cn(!isAi && "cursor-pointer hover:underline", isAi ? "text-app-ai" : m.mine || presence.person(lastSeenByProfile.get(m.authorId ?? "")).online ? "text-app-accent-text" : "text-app-accent-text/55")}>
                      {isAi ? t("chat.aiName") : m.authorName}
                    </strong>
                    <span className="ml-1.5 text-xs text-app-text-dim">{time(m._creationTime)}</span>
                  </div>
                )}
                {isAi ? (
                  m.askStatus ? (
                    <AskCard status={m.askStatus} body={m.body} />
                  ) : m.summaryStatus ? (
                    <SummaryCard status={m.summaryStatus} body={m.body} source={m.summarySource} onLayout={keepBottom} />
                  ) : (
                    <div className="mt-2 max-w-[560px] rounded-[calc(14px*var(--radius-scale))] border border-app-ai-border bg-app-ai-bg px-3.5 py-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-app-text">
                      <Markdown text={m.body} />
                    </div>
                  )
                ) : m.kind === "media" && m.attachments.length > 0 ? (
                  <div>
                    {m.body && (
                      <MessageBody style={null} body={m.body} authorName={m.authorName} edited={false} className={row.head ? "mt-[3px]" : undefined} />
                    )}
                    <div className="mt-1 flex flex-wrap gap-2">
                      {m.attachments.map((a, i) => {
                        const single = m.attachments.length === 1;
                        return a.type === "image" ? (
                          <MinimizableMedia key={i}>
                          <img
                            src={a.url}
                            alt={a.name}
                            loading="lazy"
                            onLoad={keepBottom}
                            onClick={() => setLightbox({ url: a.url, type: "image", name: a.name })}
                            className={cn("cursor-zoom-in rounded-xl", single ? "max-h-80 max-w-[min(420px,100%)]" : "max-h-52 max-w-[min(260px,100%)]")}
                          />
                          </MinimizableMedia>
                        ) : (
                          <div key={i} className={cn("group/video relative w-fit", single ? "max-w-[min(420px,100%)]" : "max-w-[min(260px,100%)]")}>
                            <video
                              src={a.url}
                              controls
                              playsInline
                              preload="metadata"
                              onLoadedMetadata={keepBottom}
                              className={cn("rounded-xl bg-black", single ? "max-h-80" : "max-h-52", "max-w-full")}
                            />
                            <button
                              type="button"
                              aria-label={t("chat.fullscreen")}
                              title={t("chat.fullscreen")}
                              onClick={() => setLightbox({ url: a.url, type: "video", name: a.name })}
                              className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 transition-opacity group-hover/video:opacity-100 focus-visible:opacity-100"
                            >
                              <Maximize2 className="size-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : m.kind === "gif" ? (
                  <div>
                    {m.gifQuery && <div className="text-[13px] text-app-text-muted italic">/giphy {m.gifQuery}</div>}
                  <MinimizableMedia className="mt-1">
                  <img
                    src={m.body}
                    alt={t("chat.gifAlt")}
                    loading="lazy"
                    onLoad={() => {
                      // L'immagine cambia l'altezza dopo il caricamento: se eri in fondo, resta in fondo.
                      if (stickToBottom.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                    }}
                    className="max-h-60 max-w-[min(320px,100%)] rounded-xl"
                  />
                  </MinimizableMedia>
                  </div>
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
                {editingId !== m._id &&
                  (m.kind === "media" || (m.kind === "text" && (m.style === null || m.style === "me" || m.style === "quote"))) &&
                  [...new Set(splitLinks(m.body).flatMap((p) => (p.type === "link" ? [p.href] : [])))]
                    .slice(0, 2)
                    .map((href) => <LinkPreview key={href} url={href} onLayout={keepBottom} />)}
                {m.summarizable && !m.summarized && editingId !== m._id && (
                  <button
                    type="button"
                    disabled={summarizing.has(m._id)}
                    onClick={() => void summarize(m._id)}
                    className="mt-1.5 flex w-fit items-center gap-1.5 rounded-lg border border-app-ai-border bg-app-ai-bg px-2.5 py-1 text-[13px] font-semibold text-app-ai hover:opacity-80 disabled:opacity-60"
                  >
                    {summarizing.has(m._id) ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2.2} /> : <Sparkles className="size-3.5" strokeWidth={2} />}
                    {summarizing.has(m._id) ? t("chat.summarizing") : t("chat.summarize")}
                  </button>
                )}
                <ReactionChips messageId={m._id} reactions={m.reactions} onError={setError} />
              </div>
            </div>
          );
        })}
        </div>
        <div className="pointer-events-none sticky bottom-0 h-0">
          <button
            type="button"
            aria-label={t("chat.jumpToLatest")}
            title={t("chat.jumpToLatest")}
            tabIndex={awayFromBottom ? 0 : -1}
            onClick={() => {
              stickToBottom.current = true;
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            }}
            className={cn(
              "pointer-events-auto absolute right-1 bottom-3 flex size-10 items-center justify-center rounded-full border border-app-border-strong bg-app-panel text-app-text shadow-lg transition-all hover:bg-app-field",
              awayFromBottom ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
            )}
          >
            <ArrowDown className="size-5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {lightbox && <MediaLightbox item={lightbox} onClose={() => setLightbox(null)} />}

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
        {pending.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2.5 rounded-xl border border-app-border bg-app-bg p-2.5">
            {pending.map((p) => (
              <div key={p.id} className="relative">
                {p.previewUrl ? (
                  <img src={p.previewUrl} alt={p.file.name} className="size-20 rounded-xl object-cover" />
                ) : (
                  <div className="flex size-20 flex-col items-center justify-center gap-1 rounded-xl bg-app-field px-1.5 text-app-text-muted">
                    <Film className="size-6" />
                    <span className="w-full truncate text-center text-[10px]">{p.file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={t("composer.removeAttachment")}
                  title={t("composer.removeAttachment")}
                  onClick={() => unstage(p.id)}
                  className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-app-border-strong bg-app-panel text-app-text shadow hover:bg-app-field"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="h-4 truncate px-2 text-xs leading-4 text-app-text-muted italic" aria-live="polite">
          {typingNames.length === 1 && t("chat.typing.one", { name: typingNames[0] })}
          {typingNames.length === 2 && t("chat.typing.two", { a: typingNames[0], b: typingNames[1] })}
          {typingNames.length > 2 && t("chat.typing.many")}
        </div>
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
              const files = Array.from(e.clipboardData.files);
              if (files.length > 0) {
                e.preventDefault();
                stageFiles(files);
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
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = ""; // permette di scegliere di nuovo lo stesso file
              if (files.length > 0) stageFiles(files);
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
            disabled={draft.trim().length === 0 && pending.length === 0}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-app-accent text-app-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send className="size-5" strokeWidth={2} />
          </button>
        </div>
      </footer>
      </div>
    </>
  );
}

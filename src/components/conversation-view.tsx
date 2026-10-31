import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Send, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "@/components/avatar";
import { useI18n } from "@/i18n/i18n-provider";
import { usePresence } from "@/lib/presence";
import { errorKey } from "@/lib/errors";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;
const NEAR_BOTTOM_PX = 80;
const SAME_BLOCK_MS = 5 * 60 * 1000;

export function ConversationView({ conversationId }: { conversationId: Id<"conversations"> }) {
  const { t, locale } = useI18n();
  const presence = usePresence();
  const info = useQuery(api.conversations.get, { conversationId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.list,
    { conversationId },
    { initialNumItems: PAGE_SIZE },
  );
  const sendMessage = useMutation(api.messages.send);
  const markRead = useMutation(api.conversations.markRead);

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        prev.kind !== m.kind ||
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

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError(null);
    stickToBottom.current = true;
    try {
      await sendMessage({ conversationId, body });
    } catch (e) {
      setDraft(body); // non perdere quello che avevi scritto
      setError(t(errorKey(e)));
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
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
            return <p className={cn("text-[13px]", s.online ? "font-semibold text-app-online" : "text-app-text-muted")}>{s.text}</p>;
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
            <div key={m._id} className={cn("flex gap-3", row.head ? "mt-[18px]" : "mt-0.5")}>
              <div className="w-[38px] shrink-0">
                {row.head &&
                  (isAi ? (
                    <span className="flex size-[38px] items-center justify-center rounded-[11px] bg-app-ai-bg text-app-ai">
                      <Sparkles className="size-5" strokeWidth={1.8} />
                    </span>
                  ) : (
                    <Avatar name={m.authorName} index={m.authorAvatarIndex} size={38} accent={m.mine} />
                  ))}
              </div>
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
                ) : (
                  <p className={cn("text-[15px] leading-normal break-words whitespace-pre-wrap text-app-text", row.head && "mt-[3px]")}>
                    {m.body}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="shrink-0 px-6 pb-5">
        {error && (
          <p role="alert" className="pb-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-end gap-1 rounded-2xl border border-app-border bg-app-bg p-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            aria-label={t("chat.composer")}
            placeholder={t("chat.composer")}
            className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-[11px] text-[15px] text-app-text outline-none placeholder:text-app-text-dim"
          />
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

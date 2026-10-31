import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Pencil, SmilePlus, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { EmojiPanel } from "@/components/emoji-gif-picker";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { cn } from "@/lib/utils";

export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
}

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

/** Funzione che aggiunge/toglie la mia reazione; gli errori arrivano come testo già tradotto. */
function useToggleReaction(messageId: Id<"messages">, onError: (text: string) => void) {
  const { t } = useI18n();
  const toggle = useMutation(api.reactions.toggle);
  return (emoji: string) => {
    toggle({ messageId, emoji }).catch((e: unknown) => onError(t(errorKey(e))));
  };
}

/** Le reazioni sotto un messaggio: un clic su una di esse aggiunge o toglie la tua. */
export function ReactionChips({
  messageId,
  reactions,
  onError,
}: {
  messageId: Id<"messages">;
  reactions: ReactionSummary[];
  onError: (text: string) => void;
}) {
  const react = useToggleReaction(messageId, onError);
  if (reactions.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          title={r.names.join(", ") + (r.count > r.names.length ? ` +${r.count - r.names.length}` : "")}
          aria-pressed={r.mine}
          onClick={() => react(r.emoji)}
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[13px] leading-none transition-colors",
            r.mine
              ? "border-app-accent bg-app-accent-soft font-bold text-app-text-strong"
              : "border-app-border bg-app-field font-semibold text-app-text-soft hover:border-app-border-strong",
          )}
        >
          <span className="text-[15px]">{r.emoji}</span>
          {r.count}
        </button>
      ))}
    </div>
  );
}

/** Barra che compare sul messaggio al passaggio del mouse: reazioni rapide e selettore completo. */
export function ReactionToolbar({
  messageId,
  onError,
  onEdit,
  onDelete,
}: {
  messageId: Id<"messages">;
  onError: (text: string) => void;
  /** Presente solo sui propri messaggi di testo. */
  onEdit?: () => void;
  /** Presente sui propri messaggi di testo e GIF; chiede conferma prima di eliminare. */
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  const react = useToggleReaction(messageId, onError);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Il selettore completo e la conferma di eliminazione si chiudono cliccando fuori o con Esc.
  useEffect(() => {
    if (!open && !confirming) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, confirming]);

  return (
    <div
      ref={boxRef}
      className={cn("absolute -top-4 right-2 z-20 group-hover:flex", open || confirming ? "flex" : "hidden")}
    >
      <div className="flex items-center gap-0.5 rounded-lg border border-app-border-strong bg-app-panel p-0.5 shadow-md">
        {QUICK_EMOJI.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            onClick={() => react(emoji)}
            className="flex size-7 items-center justify-center rounded-md text-base hover:bg-app-field"
          >
            {emoji}
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-app-border" />
        {onEdit && (
          <button
            type="button"
            aria-label={t("chat.editMessage")}
            title={t("chat.editMessage")}
            onClick={onEdit}
            className="flex size-7 items-center justify-center rounded-md text-app-text-muted hover:bg-app-field hover:text-app-text"
          >
            <Pencil className="size-4" strokeWidth={1.9} />
          </button>
        )}
        {onDelete &&
          (confirming ? (
            <button
              type="button"
              onClick={onDelete}
              className="flex h-7 items-center rounded-md bg-destructive px-2 text-xs font-bold text-white hover:opacity-90"
            >
              {t("chat.deleteConfirm")}
            </button>
          ) : (
            <button
              type="button"
              aria-label={t("chat.deleteMessage")}
              title={t("chat.deleteMessage")}
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
              className="flex size-7 items-center justify-center rounded-md text-app-text-muted hover:bg-app-field hover:text-destructive"
            >
              <Trash2 className="size-4" strokeWidth={1.9} />
            </button>
          ))}
        <button
          type="button"
          aria-label={t("reactions.add")}
          title={t("reactions.add")}
          aria-expanded={open}
          onClick={() => {
            // Nella metà bassa della finestra il selettore si apre verso l'alto, per non uscire dallo schermo.
            const top = boxRef.current?.getBoundingClientRect().top ?? 0;
            setUp(top > window.innerHeight / 2);
            setOpen((o) => !o);
          }}
          className="flex size-7 items-center justify-center rounded-md text-app-text-muted hover:bg-app-field hover:text-app-text"
        >
          <SmilePlus className="size-[18px]" strokeWidth={1.9} />
        </button>
      </div>

      {open && (
        <div className={cn("absolute right-0 h-[360px] w-[min(340px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-app-border-strong bg-app-panel shadow-2xl", up ? "bottom-full mb-1" : "top-full mt-1")}>
          <EmojiPanel
            onEmoji={(emoji) => {
              react(emoji);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

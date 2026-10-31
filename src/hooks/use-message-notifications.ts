import { useEffect, useRef } from "react";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { ConversationItem } from "@/components/chat-app";
import { useI18n } from "@/i18n/i18n-provider";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Latest = NonNullable<ConversationItem["latest"]>;

/** La finestra non è davanti all'utente? */
const inBackground = () => document.hidden || !document.hasFocus();

async function ensurePermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/**
 * Notifiche di sistema per i messaggi nuovi (con suono), numero di non letti sull'icona nel Dock
 * e rimbalzo dell'icona. Le notifiche partono solo se l'app non è in primo piano.
 */
export function useMessageNotifications(conversations: ConversationItem[] | null | undefined) {
  const { t } = useI18n();
  const seen = useRef<Map<string, string> | null>(null); // chat → id dell'ultimo messaggio già visto

  // Chiede il permesso subito, così il sistema mostra la richiesta al primo avvio e non al primo messaggio.
  useEffect(() => {
    if (isTauri()) void ensurePermission();
  }, []);

  // Numero sull'icona.
  const totalUnread = conversations?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;
  useEffect(() => {
    if (!isTauri()) return;
    getCurrentWindow()
      .setBadgeCount(totalUnread > 0 ? totalUnread : undefined)
      .catch(() => undefined); // non supportato su Windows
  }, [totalUnread]);

  useEffect(() => {
    if (!conversations) return;
    const previous = seen.current;
    const next = new Map<string, string>(previous ?? []);
    const fresh: { title: string; latest: Latest }[] = [];

    for (const c of conversations) {
      if (!c.latest) continue;
      if (previous && previous.get(c._id) !== c.latest.id) fresh.push({ title: c.title, latest: c.latest });
      next.set(c._id, c.latest.id);
    }
    seen.current = next;
    // La prima volta si memorizza solo ciò che c'è già: niente raffica di notifiche all'avvio.
    if (!previous || fresh.length === 0 || !isTauri() || !inBackground()) return;

    const preview = (l: Latest): string => {
      const caption = l.body.trim();
      if (l.kind === "gif") return "GIF";
      if (l.kind === "media") {
        const label = t(l.attachment === "video" ? "notif.video" : "notif.photo");
        return caption ? `${label} ${caption}` : label;
      }
      if (l.style === "random") return t("notif.random");
      if (l.style === "flip") return t("notif.flip");
      if (l.style === "spoiler") return t("notif.spoiler");
      return caption;
    };

    void (async () => {
      if (!(await ensurePermission())) return;
      for (const { title, latest } of fresh.slice(-3)) {
        const author = latest.authorName ?? t("chat.aiName");
        const text = preview(latest);
        // In un gruppo si legge chi scrive; in una chat diretta il titolo è già il suo nome.
        const isGroup = author !== title;
        sendNotification({ title: isGroup ? title : author, body: isGroup ? `${author}: ${text}` : text, sound: "default" });
      }
      void getCurrentWindow().requestUserAttention(UserAttentionType.Informational).catch(() => undefined);
    })();
  }, [conversations, t]);
}

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useI18n } from "@/i18n/i18n-provider";

/** Un utente è "online" se ha dato segni di vita negli ultimi 2 minuti (l'app li invia ogni 45 s). */
export const ONLINE_WINDOW_MS = 2 * 60_000;
const HEARTBEAT_MS = 45_000;

/** Segnala al server che sono attivo, finché l'app è visibile. */
export function usePresenceHeartbeat() {
  const heartbeat = useMutation(api.users.heartbeat);
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "visible") heartbeat().catch(() => {});
    };
    ping();
    const id = window.setInterval(ping, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", ping);
    window.addEventListener("focus", ping);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
      window.removeEventListener("focus", ping);
    };
  }, [heartbeat]);
}

export interface PresenceStatus {
  online: boolean;
  text: string;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/**
 * Stato di presenza pronto da mostrare: "Online" / "Ultimo accesso 3 anni fa" per una persona,
 * "5 membri · 2 online" per un gruppo. Si aggiorna da solo col passare del tempo.
 */
export function usePresence() {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const isOnline = (lastSeenAt: number | undefined | null) =>
      lastSeenAt != null && now - lastSeenAt < ONLINE_WINDOW_MS;

    const person = (lastSeenAt: number | undefined | null): PresenceStatus => {
      if (lastSeenAt == null) return { online: false, text: t("presence.offline") };
      if (isOnline(lastSeenAt)) return { online: true, text: t("side.online") };
      const seconds = Math.max(0, Math.round((now - lastSeenAt) / 1000));
      const [unit, size] = UNITS.find(([, s]) => seconds >= s) ?? ["minute", 60];
      return { online: false, text: t("presence.lastOnline", { time: rtf.format(-Math.floor(seconds / size), unit) }) };
    };

    const group = (memberCount: number, othersLastSeenAt: number[]): PresenceStatus => {
      const online = othersLastSeenAt.filter(isOnline).length;
      return online > 0
        ? { online: true, text: t("presence.groupOnline", { count: memberCount, online }) }
        : { online: false, text: t("chat.members", { count: memberCount }) };
    };

    return { person, group };
  }, [now, locale, t]);
}

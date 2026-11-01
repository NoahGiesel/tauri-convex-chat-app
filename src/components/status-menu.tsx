import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bell, BellOff, Check, ChevronDown } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useI18n } from "@/i18n/i18n-provider";
import { isNotificationSoundEnabled, setNotificationSoundEnabled } from "@/lib/notification-sound";
import { cn } from "@/lib/utils";

/** Il mio stato nella barra laterale: cliccandolo si sceglie online/offline e si attivano o no i suoni delle notifiche. */
export function StatusMenu() {
  const { t } = useI18n();
  const me = useQuery(api.users.me);
  const setInvisible = useMutation(api.users.setInvisible);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(isNotificationSoundEnabled);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const invisible = me?.invisible === true;
  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-app-text hover:bg-app-field";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1 rounded-md text-[13px] font-semibold hover:opacity-80",
          invisible ? "text-app-text-dim" : "text-app-online",
        )}
      >
        {invisible ? t("presence.offline") : t("side.online")}
        {!sound && <BellOff className="size-3" strokeWidth={2.2} />}
        <ChevronDown className="size-3.5" strokeWidth={2.4} />
      </button>

      {open && (
        <div role="menu" className="absolute top-full left-0 z-40 mt-1.5 w-56 rounded-xl border border-app-border-strong bg-app-panel p-1 shadow-xl">
          <button type="button" role="menuitemradio" aria-checked={!invisible} onClick={() => void setInvisible({ invisible: false })} className={item}>
            <span className="size-2.5 rounded-full bg-app-online" />
            <span className="flex-1">{t("side.online")}</span>
            {!invisible && <Check className="size-4 text-app-accent-text" strokeWidth={2.4} />}
          </button>
          <button type="button" role="menuitemradio" aria-checked={invisible} onClick={() => void setInvisible({ invisible: true })} className={item}>
            <span className="size-2.5 rounded-full bg-app-text-dim" />
            <span className="flex-1">{t("status.appearOffline")}</span>
            {invisible && <Check className="size-4 text-app-accent-text" strokeWidth={2.4} />}
          </button>
          <div className="my-1 h-px bg-app-border" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={sound}
            onClick={() => {
              const next = !sound;
              setSound(next);
              setNotificationSoundEnabled(next);
            }}
            className={item}
          >
            {sound ? <Bell className="size-4 text-app-text-muted" strokeWidth={2} /> : <BellOff className="size-4 text-app-text-muted" strokeWidth={2} />}
            <span className="flex-1">{t("status.notificationSound")}</span>
            {sound && <Check className="size-4 text-app-accent-text" strokeWidth={2.4} />}
          </button>
        </div>
      )}
    </div>
  );
}

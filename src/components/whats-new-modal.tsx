import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { RELEASE_NOTES } from "@/data/release-notes";
import { useAppVersion } from "@/hooks/use-app-version";
import { useI18n } from "@/i18n/i18n-provider";
import { primaryButtonClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const KEY = "chat:last-seen-version";

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (version: string) => {
  try {
    localStorage.setItem(KEY, version);
  } catch {
    // ignora
  }
};

/** Dopo un aggiornamento mostra le novità della versione appena installata, una sola volta. */
export function WhatsNewModal() {
  const { t, language } = useI18n();
  const version = useAppVersion();
  const [open, setOpen] = useState(false);

  const notes = RELEASE_NOTES.find((r) => r.version === version);

  useEffect(() => {
    if (!version) return;
    const seen = read();
    if (seen === version) return;
    if (seen === null || !notes) {
      write(version); // primo avvio o versione senza note: niente da mostrare
      return;
    }
    setOpen(true);
  }, [version, notes]);

  if (!open || !version || !notes) return null;
  const items = (language === "it" ? notes.items.it : undefined) ?? notes.items.en;
  const close = () => {
    write(version);
    setOpen(false);
  };

  return (
    <Modal title={t("whatsNew.title", { version })} onClose={close}>
      <ul className="flex flex-col gap-2 text-[15px] text-app-text">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-app-text-dim">•</span>
            <span className="min-w-0 flex-1">{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={close} autoFocus className={cn(primaryButtonClass, "h-11 px-6 text-[15px]")}>
          {t("whatsNew.ok")}
        </button>
      </div>
    </Modal>
  );
}

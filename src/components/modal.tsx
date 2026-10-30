import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";

/** Finestra modale come nel design: pannello arrotondato su sfondo scurito. Si chiude con Esc o cliccando fuori. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-backdrop/80 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-full w-full max-w-lg flex-col gap-5 overflow-y-auto rounded-[20px] border border-app-border bg-app-panel p-6 text-app-text"
      >
        <div className="flex items-center">
          <h2 className="flex-1 text-2xl font-extrabold tracking-tight text-app-text-strong">{title}</h2>
          <button
            type="button"
            aria-label={t("invite.close")}
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-[10px] text-app-text-muted hover:bg-app-field"
          >
            <X className="size-5" strokeWidth={2.2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

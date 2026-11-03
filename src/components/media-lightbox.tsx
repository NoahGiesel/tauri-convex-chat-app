import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export interface LightboxItem {
  url: string;
  type: "image" | "video";
  name: string;
  /** Per foto piccole (es. l'immagine del profilo): la ingrandisce a un riquadro grande invece di mostrarla a grandezza naturale. */
  enlarge?: boolean;
}

/** Foto o video a tutto schermo: si chiude con Esc, con la X o cliccando fuori dal contenuto. */
export function MediaLightbox({ item, onClose }: { item: LightboxItem; onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    // In fase di cattura e fermando l'evento: se la foto è aperta sopra una finestra (es. il profilo), Esc chiude solo la foto.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={item.name} onClick={onClose} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
      <button
        type="button"
        aria-label={t("common.close")}
        title={t("common.close")}
        onClick={onClose}
        className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      {item.type === "image" ? (
        <img src={item.url} alt={item.name} onClick={(e) => e.stopPropagation()} className={cn("rounded-lg object-contain", item.enlarge ? "size-[min(80vh,80vw,640px)]" : "max-h-full max-w-full")} />
      ) : (
        <video src={item.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg bg-black" />
      )}
    </div>,
    document.body,
  );
}

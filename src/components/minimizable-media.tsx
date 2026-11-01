import { useState, type ReactNode } from "react";
import { ImageIcon, Minus } from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

/** Immagine o GIF con un pulsante "riduci" (solo al passaggio del mouse) che la nasconde; resta una riga per riaprirla. */
export function MinimizableMedia({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="mt-1 flex w-fit items-center gap-2 rounded-lg border border-app-border bg-app-field px-3 py-1.5 text-[13px] text-app-text-muted hover:text-app-text"
      >
        <ImageIcon className="size-4" strokeWidth={1.9} />
        {t("media.show")}
      </button>
    );
  }

  return (
    <div className={cn("group/media relative w-fit max-w-full", className)}>
      {children}
      <button
        type="button"
        aria-label={t("media.minimize")}
        title={t("media.minimize")}
        onClick={() => setHidden(true)}
        className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover/media:opacity-100 hover:bg-black/80 focus-visible:opacity-100"
      >
        <Minus className="size-4" strokeWidth={2.4} />
      </button>
    </div>
  );
}

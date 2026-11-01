import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** Quadrato arrotondato con l'iniziale, come nel design. I colori vengono dal tema (`--app-av-1…`). */
export function Avatar({
  name,
  index,
  size = 40,
  accent = false,
  src,
  className,
}: {
  name: string;
  index: number;
  size?: number;
  /** Usa il colore d'accento (per "me"). */
  accent?: boolean;
  /** Foto profilo; senza, si mostra l'iniziale colorata. */
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        className={cn("shrink-0 object-cover select-none", className)}
        style={{ width: size, height: size, borderRadius: `calc(${Math.round(size * 0.3)}px * var(--radius-scale, 1))` }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-extrabold select-none",
        accent ? "text-app-accent-fg" : "text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: `calc(${Math.round(size * 0.3)}px * var(--radius-scale, 1))`,
        fontSize: Math.round(size * 0.38),
        background: accent ? "var(--app-accent)" : `var(--app-av-${index + 1}, var(--app-accent))`,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Avatar dei gruppi: icona su fondo neutro. */
export function GroupAvatar({ size = 40, className, icon }: { size?: number; className?: string; icon?: string | null }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center bg-app-raised text-app-text-soft", className)}
      style={{ width: size, height: size, borderRadius: `calc(${Math.round(size * 0.3)}px * var(--radius-scale, 1))` }}
    >
      {icon ? (
        <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{icon}</span>
      ) : (
        <Users style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} />
      )}
    </span>
  );
}

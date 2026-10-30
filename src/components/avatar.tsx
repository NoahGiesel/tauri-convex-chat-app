import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** Quadrato arrotondato con l'iniziale, come nel design. I colori vengono dal tema (`--app-av-1…`). */
export function Avatar({
  name,
  index,
  size = 40,
  accent = false,
  className,
}: {
  name: string;
  index: number;
  size?: number;
  /** Usa il colore d'accento (per "me"). */
  accent?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-extrabold select-none",
        accent ? "text-app-accent-fg" : "text-app-text-strong",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        fontSize: Math.round(size * 0.38),
        background: accent ? "var(--app-accent)" : `var(--app-av-${index + 1}, var(--app-accent))`,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Avatar dei gruppi: icona su fondo neutro. */
export function GroupAvatar({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center bg-app-raised text-app-text-soft", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <Users style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} />
    </span>
  );
}

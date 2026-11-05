import { cn } from "@/lib/utils";

/** Colori delle caselle, dal tema: giusta = online, presente = upload, assente = raised; il testo usa lo sfondo. */
export const TILE_CLASS = {
  correct: "border-transparent bg-app-online text-app-bg",
  present: "border-transparent bg-app-upload text-app-bg",
  absent: "border-transparent bg-app-raised text-app-bg",
  empty: "border-app-border bg-transparent",
  typed: "border-app-border-strong bg-app-field text-app-text-strong",
} as const;
export type TileKind = keyof typeof TILE_CLASS;

const SIZE = {
  sm: "size-[18px] rounded-[4px] border text-[10px]",
  md: "size-11 rounded-lg border-2 text-xl",
  lg: "size-14 rounded-lg border-2 text-2xl",
} as const;

/** Una casella della griglia del Wordle Duel. */
export function Tile({ letter, kind, size = "md" }: { letter?: string; kind: TileKind; size?: keyof typeof SIZE }) {
  return <div className={cn("flex items-center justify-center font-extrabold uppercase", SIZE[size], TILE_CLASS[kind])}>{letter}</div>;
}

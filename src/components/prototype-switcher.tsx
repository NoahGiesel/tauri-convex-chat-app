// PROTOTYPE: floating variant switcher for throwaway UI prototypes. Never ships (dev builds only).
import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function useVariantParam(keys: readonly string[], value: string, onChange: (v: string) => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const i = keys.indexOf(value);
      const next = keys[(i + (e.key === "ArrowRight" ? 1 : keys.length - 1)) % keys.length];
      onChange(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, value, onChange]);
}

export function readVariant(keys: readonly string[]): string {
  const v = new URLSearchParams(window.location.search).get("variant") ?? keys[0];
  return keys.includes(v) ? v : keys[0];
}

export function writeVariant(v: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", v);
  window.history.replaceState(null, "", url);
}

export function PrototypeSwitcher({
  keys,
  names,
  current,
  onChange,
  children,
}: {
  keys: readonly string[];
  names: Record<string, string>;
  current: string;
  onChange: (v: string) => void;
  children?: ReactNode;
}) {
  if (!import.meta.env.DEV) return null;
  const i = keys.indexOf(current);
  const go = (d: number) => onChange(keys[(i + d + keys.length) % keys.length]);
  return (
    <div className="fixed bottom-3 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-2xl bg-black/90 px-3 py-2 text-xs text-white shadow-2xl ring-1 ring-yellow-400/70">
      <div className="flex items-center gap-2">
        <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-black text-black">PROTOTYPE</span>
        <button type="button" onClick={() => go(-1)} className="rounded p-1 hover:bg-white/15" aria-label="Previous variant">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-44 text-center font-bold">
          {current} ({names[current]})
        </span>
        <button type="button" onClick={() => go(1)} className="rounded p-1 hover:bg-white/15" aria-label="Next variant">
          <ChevronRight className="size-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

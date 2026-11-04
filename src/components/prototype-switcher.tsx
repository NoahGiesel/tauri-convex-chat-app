// PROTOTYPE tooling, throwaway. Floating bar that cycles UI variants through the `?variant=` search param.
import { useEffect, useState } from "react";

export function useVariant(keys: string[]): [string, (k: string) => void] {
  const read = () => {
    const v = new URLSearchParams(location.search).get("variant") ?? keys[0];
    return keys.includes(v) ? v : keys[0];
  };
  const [value, setValue] = useState(read);
  const set = (k: string) => {
    const p = new URLSearchParams(location.search);
    p.set("variant", k);
    history.replaceState(null, "", `?${p}`);
    setValue(k);
  };
  return [value, set];
}

export function PrototypeSwitcher({ variants, current, onChange }: { variants: { key: string; name: string }[]; current: string; onChange: (k: string) => void }) {
  const i = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (step: number) => onChange(variants[(i + step + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;
  const v = variants[i];
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#fde047] px-1.5 py-1 font-mono text-sm font-bold text-black shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      <button type="button" onClick={() => go(-1)} className="rounded-full px-3 py-1 hover:bg-black/10" aria-label="Previous variant">
        ←
      </button>
      <span className="px-2">
        {v.key} ({v.name})
      </span>
      <button type="button" onClick={() => go(1)} className="rounded-full px-3 py-1 hover:bg-black/10" aria-label="Next variant">
        →
      </button>
    </div>
  );
}

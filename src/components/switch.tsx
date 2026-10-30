import { cn } from "@/lib/utils";

/** Interruttore on/off come nel design. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors",
        checked ? "bg-app-accent" : "bg-app-border-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] size-5 rounded-full bg-app-accent-fg transition-all",
          checked ? "right-[3px]" : "left-[3px] bg-app-text-soft",
        )}
      />
    </button>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { outlineButtonClass, primaryButtonClass } from "@/lib/ui-classes";

/** Modifica sul posto del proprio messaggio: Invio salva, Esc annulla, Maiusc+Invio va a capo. */
export function MessageEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const save = () => onSave(value);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      save();
    }
  }

  return (
    <div className="mt-1 flex max-w-[640px] flex-col gap-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        aria-label={t("chat.editMessage")}
        className="field-sizing-content max-h-60 min-h-11 w-full resize-none rounded-xl border border-app-accent bg-app-bg px-3 py-[11px] text-[15px] text-app-text outline-none"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className={cn(outlineButtonClass, "h-8 px-3 text-[13px]")}>
          {t("chat.editCancel")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={value.trim().length === 0}
          className={cn(primaryButtonClass, "h-8 px-3.5 text-[13px]")}
        >
          {t("chat.editSave")}
        </button>
        <span className="text-xs text-app-text-dim">{t("chat.editHint")}</span>
      </div>
    </div>
  );
}

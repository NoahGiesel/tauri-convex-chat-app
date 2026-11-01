import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { GroupAvatar } from "@/components/avatar";
import { Modal } from "@/components/modal";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fieldClass, outlineButtonClass, primaryButtonClass, sectionLabelClass } from "@/lib/ui-classes";

const ICONS = [
  "💬", "🎮", "🍕", "🎵", "🎬", "📚", "💻", "🚀", "⚽", "🏀", "🏖️", "✈️",
  "🍺", "☕", "🎉", "❤️", "🔥", "⭐", "🌱", "🐶", "🐱", "🦊", "👾", "🤖",
  "🎨", "📷", "🏠", "💼", "🧠", "💡", "🎲", "🏆",
];

/** Rinomina un gruppo e ne sceglie l'icona (un'emoji o quella predefinita). */
export function EditGroupModal({
  conversationId,
  name: initialName,
  icon: initialIcon,
  onClose,
}: {
  conversationId: Id<"conversations">;
  name: string;
  icon: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const updateGroup = useMutation(api.conversations.updateGroup);
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState<string | null>(initialIcon);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== initialName || icon !== initialIcon;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateGroup({ conversationId, name, icon });
      onClose();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("group.editTitle")} onClose={onClose}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && name.trim().length >= 1) void save();
        }}
      >
        <div className="flex items-center gap-3.5">
          <GroupAvatar size={64} icon={icon} className="rounded-[calc(18px*var(--radius-scale))]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="edit-gname" className={sectionLabelClass}>{t("group.nameLabel")}</label>
            <input id="edit-gname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus autoComplete="off" className={fieldClass} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className={sectionLabelClass}>{t("group.iconLabel")}</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setIcon(null)}
              className={cn("flex size-10 items-center justify-center rounded-xl border", icon === null ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-app-bg hover:bg-app-field")}
              title={t("group.iconNone")}
              aria-label={t("group.iconNone")}
            >
              <GroupAvatar size={24} className="bg-transparent" />
            </button>
            {ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                aria-pressed={icon === emoji}
                className={cn("flex size-10 items-center justify-center rounded-xl border text-xl", icon === emoji ? "border-app-accent bg-app-accent-soft" : "border-app-border bg-app-bg hover:bg-app-field")}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={cn(outlineButtonClass, "h-10 px-4 text-sm")}>{t("group.cancel")}</button>
          <button type="submit" disabled={busy || !dirty || name.trim().length < 1} className={cn(primaryButtonClass, "h-10 px-5 text-sm")}>
            {busy ? t("auth.busy") : t("settings.profile.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

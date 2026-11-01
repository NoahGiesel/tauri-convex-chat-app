import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar, GroupAvatar } from "@/components/avatar";
import { Modal } from "@/components/modal";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { modalFieldClass, outlineButtonClass, primaryButtonClass, sectionLabelClass } from "@/lib/ui-classes";

export function GroupModal({
  onClose,
  onOpenChat,
}: {
  onClose: () => void;
  onOpenChat: (id: Id<"conversations">) => void;
}) {
  const { t } = useI18n();
  const data = useQuery(api.friends.list);
  const createGroup = useMutation(api.conversations.createGroup);

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<Id<"profiles">>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const friends = data?.friends ?? [];

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const id = await createGroup({ name, memberIds: [...selected] });
      onOpenChat(id);
      onClose();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("group.title")} onClose={onClose}>
      <div className="flex items-center gap-3.5">
        <GroupAvatar size={64} className="rounded-[calc(18px*var(--radius-scale))]" />
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="gname" className="text-[13px] font-bold text-app-text-soft">
            {t("group.nameLabel")}
          </label>
          <input
            id="gname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("group.namePlaceholder")}
            maxLength={60}
            autoFocus
            className={modalFieldClass}
          />
        </div>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className={cn(sectionLabelClass, "mb-2 p-0 tracking-[0.06em]")}>
          {t("group.members")} · {t("group.selected", { count: selected.size })}
        </legend>

        {friends.length === 0 && <p className="text-sm text-app-text-muted">{t("group.noFriends")}</p>}

        {friends.map((f) => {
          const checked = selected.has(f.profile._id);
          return (
            <label
              key={f.profile._id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[calc(14px*var(--radius-scale))] border px-3 py-2.5",
                checked ? "border-app-accent-soft-border bg-app-accent-soft" : "border-app-border bg-app-bg",
              )}
            >
              <Avatar name={f.profile.name} index={f.profile.avatarIndex} src={f.profile.avatarUrl} size={38} />
              <span
                className={cn("flex-1 truncate text-[15px] font-bold", checked ? "text-app-text-strong" : "text-app-text")}
              >
                {f.profile.name}
              </span>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(f.profile._id);
                  else next.delete(f.profile._id);
                  setSelected(next);
                }}
                className="size-5 accent-[var(--app-accent)]"
              />
            </label>
          );
        })}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className={cn(outlineButtonClass, "h-[46px] px-5 text-[15px]")}>
          {t("group.cancel")}
        </button>
        <button
          type="button"
          disabled={busy || name.trim().length === 0}
          onClick={() => void submit()}
          className={cn(primaryButtonClass, "h-[46px] px-6 text-[15px]")}
        >
          {t("people.createGroup")}
        </button>
      </div>
    </Modal>
  );
}

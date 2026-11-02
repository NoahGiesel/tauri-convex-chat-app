import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { UserPlus, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar, GroupAvatar } from "@/components/avatar";
import { VisibilityPicker } from "@/components/group-modal";
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
  visibility: initialVisibility,
  canDelete,
  onDeleted,
  onClose,
}: {
  conversationId: Id<"conversations">;
  name: string;
  icon: string | null;
  visibility: "public" | "private";
  canDelete: boolean;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const updateGroup = useMutation(api.conversations.updateGroup);
  const deleteGroup = useMutation(api.conversations.deleteGroup);
  /** 0 = nessuna richiesta, 1 = prima conferma, 2 = conferma finale. */
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState<string | null>(initialIcon);
  const [visibility, setVisibility] = useState<"public" | "private">(initialVisibility);
  const details = useQuery(api.conversations.get, { conversationId });
  const friendsData = useQuery(api.friends.list);
  const addMembers = useMutation(api.conversations.addMembers);
  const removeMember = useMutation(api.conversations.removeMember);
  const leaveGroup = useMutation(api.conversations.leaveGroup);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<Set<Id<"profiles">>>(new Set());
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== initialName || icon !== initialIcon || visibility !== initialVisibility;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateGroup({ conversationId, name, icon, ...(canDelete ? { visibility } : {}) });
      onClose();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const memberIds = new Set((details?.members ?? []).map((m) => m._id));
  const addable = (friendsData?.friends ?? []).filter((f) => !memberIds.has(f.profile._id));

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteGroup({ conversationId });
      onDeleted();
      onClose();
    } catch (e) {
      setError(t(errorKey(e)));
      setConfirmStep(0);
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

        {canDelete && <VisibilityPicker value={visibility} onChange={setVisibility} />}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={sectionLabelClass}>{t("group.membersTitle")} · {details?.members.length ?? "…"}</span>
            <button
              type="button"
              onClick={() => setAdding((a) => !a)}
              className="flex items-center gap-1.5 text-sm font-semibold text-app-accent-text hover:underline"
            >
              <UserPlus className="size-4" strokeWidth={2} />
              {t("group.addMembers")}
            </button>
          </div>

          {adding && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-app-border bg-app-bg p-2.5">
              {addable.length === 0 && <p className="text-sm text-app-text-muted">{t("group.noneToAdd")}</p>}
              {addable.map((f) => (
                <label key={f.profile._id} className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-app-text">
                  <Avatar name={f.profile.name} index={f.profile.avatarIndex} src={f.profile.avatarUrl} size={28} />
                  <span className="min-w-0 flex-1 truncate">{f.profile.name}</span>
                  <input
                    type="checkbox"
                    checked={toAdd.has(f.profile._id)}
                    onChange={(e) => {
                      const next = new Set(toAdd);
                      if (e.target.checked) next.add(f.profile._id);
                      else next.delete(f.profile._id);
                      setToAdd(next);
                    }}
                    className="size-4 accent-[var(--app-accent)]"
                  />
                </label>
              ))}
              {addable.length > 0 && (
                <button
                  type="button"
                  disabled={busy || toAdd.size === 0}
                  onClick={() =>
                    void run(async () => {
                      await addMembers({ conversationId, profileIds: [...toAdd] });
                      setToAdd(new Set());
                      setAdding(false);
                    })
                  }
                  className={cn(primaryButtonClass, "mt-1 h-9 self-end px-4 text-sm")}
                >
                  {t("group.addSelected", { count: toAdd.size })}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            {(details?.members ?? []).map((m) => (
              <div key={m._id} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                <Avatar name={m.name} index={m.avatarIndex} src={m.avatarUrl} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-app-text">{m.name}</span>
                {m._id !== details?.myProfileId && (
                  <button
                    type="button"
                    disabled={busy}
                    title={t("group.removeMember", { name: m.name })}
                    aria-label={t("group.removeMember", { name: m.name })}
                    onClick={() => void run(() => removeMember({ conversationId, profileId: m._id }))}
                    className="flex size-7 items-center justify-center rounded-md text-app-text-muted hover:bg-app-field hover:text-destructive"
                  >
                    <X className="size-4" strokeWidth={2.2} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {confirmLeave ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm font-semibold text-app-text-strong">{t("group.leaveConfirm")}</span>
              <button type="button" onClick={() => setConfirmLeave(false)} className={cn(outlineButtonClass, "h-9 px-3 text-sm")}>{t("group.cancel")}</button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await leaveGroup({ conversationId });
                    onDeleted();
                    onClose();
                  })
                }
                className="h-9 rounded-xl bg-destructive px-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {t("group.leaveYes")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmLeave(true)} className="self-start text-sm font-semibold text-app-text-muted hover:text-destructive hover:underline">
              {t("group.leave")}
            </button>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {canDelete && (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3.5">
            {confirmStep === 0 ? (
              <button type="button" onClick={() => setConfirmStep(1)} className="self-start text-sm font-semibold text-destructive hover:underline">
                {t("group.delete")}
              </button>
            ) : (
              <>
                <p className="text-sm font-semibold text-app-text-strong">
                  {confirmStep === 1 ? t("group.deleteConfirm1", { name: initialName }) : t("group.deleteConfirm2")}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmStep(0)} disabled={busy} className={cn(outlineButtonClass, "h-9 px-4 text-sm")}>
                    {t("group.cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => (confirmStep === 1 ? setConfirmStep(2) : void remove())}
                    className="h-9 rounded-xl bg-destructive px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {confirmStep === 1 ? t("group.deleteYes") : busy ? t("auth.busy") : t("group.deleteFinal")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

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

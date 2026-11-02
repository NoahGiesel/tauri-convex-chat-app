import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Globe, Lock } from "lucide-react";
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

  const [mode, setMode] = useState<"create" | "browse">("create");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const publicGroups = useQuery(api.conversations.listPublic);
  const joinGroup = useMutation(api.conversations.joinGroup);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<Id<"profiles">>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const friends = data?.friends ?? [];

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const id = await createGroup({ name, memberIds: visibility === "public" ? [] : [...selected], visibility });
      onOpenChat(id);
      onClose();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function join(id: Id<"conversations">) {
    setError(null);
    setBusy(true);
    try {
      await joinGroup({ conversationId: id });
      onOpenChat(id);
      onClose();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    cn("h-9 flex-1 rounded-lg text-sm font-bold transition-colors", active ? "bg-app-accent text-app-accent-fg" : "text-app-text-muted hover:bg-app-field");

  return (
    <Modal title={t("group.title")} onClose={onClose}>
      <div className="flex gap-1 rounded-xl border border-app-border bg-app-bg p-1">
        <button type="button" onClick={() => setMode("create")} className={tabClass(mode === "create")}>{t("group.tabNew")}</button>
        <button type="button" onClick={() => setMode("browse")} className={tabClass(mode === "browse")}>{t("group.tabBrowse")}</button>
      </div>

      {mode === "browse" ? (
        <div className="flex flex-col gap-2">
          {publicGroups && publicGroups.length === 0 && <p className="text-sm text-app-text-muted">{t("group.browseEmpty")}</p>}
          {(publicGroups ?? []).map((g) => (
            <div key={g._id} className="flex items-center gap-3 rounded-[calc(14px*var(--radius-scale))] border border-app-border bg-app-bg px-3 py-2.5">
              <GroupAvatar size={38} icon={g.icon} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-bold text-app-text">{g.name}</div>
                <div className="text-xs text-app-text-muted">{t("group.memberCount", { count: g.memberCount })}</div>
              </div>
              <button
                type="button"
                disabled={busy || g.full}
                onClick={() => void join(g._id)}
                className={cn(primaryButtonClass, "h-9 px-4 text-sm")}
              >
                {g.full ? t("group.full") : t("group.join")}
              </button>
            </div>
          ))}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={cn(outlineButtonClass, "h-[46px] px-5 text-[15px]")}>{t("group.cancel")}</button>
          </div>
        </div>
      ) : (
      <>
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

      <VisibilityPicker value={visibility} onChange={setVisibility} />

      {visibility === "public" ? (
        <p className="rounded-[calc(14px*var(--radius-scale))] border border-app-border bg-app-bg px-4 py-3 text-sm font-semibold text-app-text-soft">
          {t("group.publicNotice")}
        </p>
      ) : (
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
      )}

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
      </>
      )}
    </Modal>
  );
}

/** Scelta tra gruppo pubblico (lo vedono e ci entrano tutti) e privato (solo chi viene aggiunto). */
export function VisibilityPicker({ value, onChange }: { value: "public" | "private"; onChange: (v: "public" | "private") => void }) {
  const { t } = useI18n();
  const option = (id: "public" | "private", Icon: typeof Globe, title: string, hint: string) => (
    <button
      key={id}
      type="button"
      onClick={() => onChange(id)}
      aria-pressed={value === id}
      className={cn(
        "flex flex-1 items-start gap-2.5 rounded-[calc(14px*var(--radius-scale))] border px-3 py-2.5 text-left",
        value === id ? "border-app-accent-soft-border bg-app-accent-soft" : "border-app-border bg-app-bg hover:bg-app-field",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-app-text-strong">{title}</span>
        <span className="block text-xs text-app-text-muted">{hint}</span>
      </span>
    </button>
  );
  return (
    <div className="flex flex-col gap-2">
      <span className={sectionLabelClass}>{t("group.visibility")}</span>
      <div className="flex gap-2">
        {option("private", Lock, t("group.private"), t("group.privateHint"))}
        {option("public", Globe, t("group.public"), t("group.publicHint"))}
      </div>
    </div>
  );
}

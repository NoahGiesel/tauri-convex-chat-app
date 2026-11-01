import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Camera, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "@/components/avatar";
import { Modal } from "@/components/modal";
import type { MessageKey } from "@/i18n/en";
import { useI18n } from "@/i18n/i18n-provider";
import { IMAGE_ACCEPT, squareThumbnail } from "@/lib/avatar-image";
import { errorKey } from "@/lib/errors";
import { usePresence } from "@/lib/presence";
import { cn } from "@/lib/utils";
import { fieldClass, outlineButtonClass, primaryButtonClass, sectionLabelClass } from "@/lib/ui-classes";

const IMAGE_ERRORS: Record<string, MessageKey> = {
  image_type: "error.image_type",
  image_too_large: "error.image_too_large",
  invalid_image: "error.invalid_image",
};

const MAX_NAME = 40;
const MAX_BIO = 200;

/** Scheda di una persona. Sul proprio profilo nome e descrizione si possono modificare. */
export function ProfileModal({ profileId, onClose }: { profileId: Id<"profiles">; onClose: () => void }) {
  const { t, locale } = useI18n();
  const presence = usePresence();
  const profile = useQuery(api.users.profile, { profileId });
  const updateProfile = useMutation(api.users.updateProfile);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.users.setAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setBio(profile.bio);
    }
  }, [profile?.name, profile?.bio]); // eslint-disable-line react-hooks/exhaustive-deps

  if (profile === undefined) return <Modal title="" onClose={onClose}><div className="h-40" /></Modal>;
  if (profile === null) return <Modal title={t("profile.title")} onClose={onClose}><p className="text-sm text-app-text-muted">{t("profile.notFound")}</p></Modal>;

  const status = presence.person(profile.lastSeenAt);
  const dirty = name.trim() !== profile.name || bio.trim() !== profile.bio;
  const joined = new Date(profile.joinedAt).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      await updateProfile({ name, bio });
      setNotice({ kind: "ok", text: t("settings.profile.saved") });
    } catch (e) {
      setNotice({ kind: "error", text: t(errorKey(e)) });
    } finally {
      setBusy(false);
    }
  }

  async function photo(action: () => Promise<unknown>, okText: string) {
    setPhotoBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "ok", text: okText });
    } catch (e) {
      const local = e instanceof Error ? IMAGE_ERRORS[e.message] : undefined;
      setNotice({ kind: "error", text: t(local ?? errorKey(e)) });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function pickPhoto(file: File) {
    await photo(async () => {
      const blob = await squareThumbnail(file);
      const response = await fetch(await generateUploadUrl(), { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      if (!response.ok) throw new Error("upload_failed");
      const { storageId } = (await response.json()) as { storageId: Parameters<typeof setAvatar>[0]["storageId"] };
      await setAvatar({ storageId });
    }, t("settings.profile.photoUpdated"));
  }

  return (
    <Modal title={profile.isMe ? t("profile.mine") : profile.name} onClose={onClose}>
      <div className="flex items-center gap-4">
        <Avatar name={profile.name} index={profile.avatarIndex} src={profile.avatarUrl} size={88} accent={profile.isMe} />
        <div className="min-w-0">
          <div className="truncate text-xl font-extrabold text-app-text-strong">{profile.name}</div>
          <div className={cn("mt-0.5 flex items-center gap-1.5 text-sm", status.online ? "font-semibold text-app-online" : "text-app-text-dim")}>
            <span className={cn("size-2 rounded-full", status.online ? "bg-app-online" : "bg-app-text-dim")} />
            {status.text}
          </div>
          <div className="mt-1 text-xs text-app-text-dim">{t("profile.joined", { date: joined })}</div>
        </div>
      </div>

      {profile.isMe && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={photoBusy} onClick={() => fileInput.current?.click()} className={cn(outlineButtonClass, "h-10 px-4 text-sm")}>
            <Camera className="size-4" strokeWidth={2} />
            {photoBusy ? t("auth.busy") : t("settings.profile.changePhoto")}
          </button>
          {profile.avatarUrl && (
            <button
              type="button"
              disabled={photoBusy}
              onClick={() => void photo(() => removeAvatar(), t("settings.profile.photoRemoved"))}
              className={cn(outlineButtonClass, "h-10 px-4 text-sm text-app-text-soft")}
            >
              <Trash2 className="size-4" strokeWidth={2} />
              {t("settings.profile.removePhoto")}
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void pickPhoto(file);
            }}
          />
        </div>
      )}

      {profile.isMe ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty && name.trim().length >= 1) void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pm-name" className={sectionLabelClass}>{t("settings.account.name")}</label>
            <input id="pm-name" value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} autoComplete="off" className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pm-bio" className={sectionLabelClass}>{t("settings.profile.bio")}</label>
            <textarea
              id="pm-bio"
              value={bio}
              maxLength={MAX_BIO}
              rows={3}
              placeholder={t("settings.profile.bioPlaceholder")}
              onChange={(e) => setBio(e.target.value)}
              className={cn(fieldClass, "h-auto resize-none py-2")}
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || !dirty || name.trim().length < 1} className={cn(primaryButtonClass, "h-10 px-5 text-sm")}>
              {busy ? t("auth.busy") : t("settings.profile.save")}
            </button>
            {notice && <span className={cn("text-sm", notice.kind === "ok" ? "text-app-online" : "text-red-400")}>{notice.text}</span>}
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className={sectionLabelClass}>{t("settings.profile.bio")}</span>
          <p className={cn("text-[15px] leading-relaxed whitespace-pre-wrap", profile.bio ? "text-app-text" : "text-app-text-dim")}>
            {profile.bio || t("profile.noBio")}
          </p>
        </div>
      )}
    </Modal>
  );
}

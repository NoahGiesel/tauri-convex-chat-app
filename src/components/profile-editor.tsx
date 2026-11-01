import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Camera, Trash2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Avatar } from "@/components/avatar";
import type { MessageKey } from "@/i18n/en";
import { useI18n } from "@/i18n/i18n-provider";
import { IMAGE_ACCEPT, squareThumbnail } from "@/lib/avatar-image";
import { errorKey } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { fieldClass, outlineButtonClass, primaryButtonClass, sectionLabelClass } from "@/lib/ui-classes";

const IMAGE_ERRORS: Record<string, MessageKey> = {
  image_type: "error.image_type",
  image_too_large: "error.image_too_large",
  invalid_image: "error.invalid_image",
};

const MAX_NAME = 40;
const MAX_BIO = 200;

/** Impostazioni › Account: foto profilo, nome e descrizione. */
export function ProfileEditor() {
  const { t } = useI18n();
  const me = useQuery(api.users.me);
  const updateProfile = useMutation(api.users.updateProfile);
  const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.users.setAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);

  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState<"save" | "photo" | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // I campi partono dai valori salvati; si riallineano quando cambiano sul server.
  useEffect(() => {
    if (me) {
      setName(me.name);
      setBio(me.bio);
    }
  }, [me?.name, me?.bio]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null;

  const dirty = name.trim() !== me.name || bio.trim() !== me.bio;
  const valid = name.trim().length >= 1;

  async function run(kind: "save" | "photo", action: () => Promise<unknown>, okText: string) {
    setBusy(kind);
    setNotice(null);
    try {
      await action();
      setNotice({ kind: "ok", text: okText });
    } catch (e) {
      const local = e instanceof Error ? IMAGE_ERRORS[e.message] : undefined;
      setNotice({ kind: "error", text: t(local ?? errorKey(e)) });
    } finally {
      setBusy(null);
    }
  }

  async function pickPhoto(file: File) {
    await run(
      "photo",
      async () => {
        const blob = await squareThumbnail(file);
        const response = await fetch(await generateUploadUrl(), {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
        });
        if (!response.ok) throw new Error("upload_failed");
        const { storageId } = (await response.json()) as { storageId: Parameters<typeof setAvatar>[0]["storageId"] };
        await setAvatar({ storageId });
      },
      t("settings.profile.photoUpdated"),
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-[calc(18px*var(--radius-scale))] border border-app-border bg-app-panel p-6">
      <div>
        <h2 className="text-lg font-extrabold text-app-text-strong">{t("settings.profile.title")}</h2>
        <p className="mt-1 text-sm text-app-text-muted">{t("settings.profile.subtitle")}</p>
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={me.name} index={0} src={me.avatarUrl} size={72} accent />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => fileInput.current?.click()}
            className={cn(outlineButtonClass, "h-10 px-4 text-sm")}
          >
            <Camera className="size-4" strokeWidth={2} />
            {busy === "photo" ? t("auth.busy") : t("settings.profile.changePhoto")}
          </button>
          {me.avatarUrl && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run("photo", () => removeAvatar(), t("settings.profile.photoRemoved"))}
              className={cn(outlineButtonClass, "h-10 px-4 text-sm text-app-text-soft")}
            >
              <Trash2 className="size-4" strokeWidth={2} />
              {t("settings.profile.removePhoto")}
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // permette di scegliere di nuovo lo stesso file
            if (file) void pickPhoto(file);
          }}
        />
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty || !valid) return;
          void run("save", () => updateProfile({ name, bio }), t("settings.profile.saved"));
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-name" className={sectionLabelClass}>
            {t("settings.account.name")}
          </label>
          <input
            id="profile-name"
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-bio" className={sectionLabelClass}>
            {t("settings.profile.bio")}
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            maxLength={MAX_BIO}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t("settings.profile.bioPlaceholder")}
            className={cn(fieldClass, "h-auto resize-none py-3")}
          />
          <span className="self-end text-xs text-app-text-dim">
            {bio.length}/{MAX_BIO}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || !valid || busy !== null}
            className={cn(primaryButtonClass, "h-11 px-5 text-[15px]")}
          >
            {busy === "save" ? t("auth.busy") : t("settings.profile.save")}
          </button>
          {notice && (
            <span
              role={notice.kind === "error" ? "alert" : "status"}
              className={cn("text-sm", notice.kind === "error" ? "text-destructive" : "text-app-online")}
            >
              {notice.text}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

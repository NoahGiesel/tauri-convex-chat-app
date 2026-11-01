import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Avatar } from "@/components/avatar";
import { ProfileEditor } from "@/components/profile-editor";
import { useI18n } from "@/i18n/i18n-provider";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { outlineButtonClass } from "@/lib/ui-classes";

export function SettingsAccount() {
  const { t } = useI18n();
  const me = useQuery(api.users.me);

  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-app-text-strong">{t("settings.nav.account")}</h1>
        <p className="mt-2 text-[15px] text-app-text-muted">{t("settings.account.subtitle")}</p>
      </div>

      <section className="flex items-center gap-4 rounded-[calc(18px*var(--radius-scale))] border border-app-border bg-app-panel p-6">
        <Avatar name={me?.name ?? ""} index={0} src={me?.avatarUrl} size={52} accent />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-extrabold text-app-text-strong">{me?.name ?? "…"}</div>
          <div className="truncate text-sm text-app-text-muted">{me?.email}</div>
        </div>
        <button
          type="button"
          onClick={() => void authClient.signOut()}
          className={cn(outlineButtonClass, "h-[46px] px-5 text-[15px]")}
        >
          {t("common.signOut")}
        </button>
      </section>

      <ProfileEditor />
    </div>
  );
}

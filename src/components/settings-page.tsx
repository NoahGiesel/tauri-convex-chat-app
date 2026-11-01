import { ArrowLeft } from "lucide-react";
import { SettingsAccount } from "@/components/settings-account";
import { SettingsAi } from "@/components/settings-ai";
import { SettingsNotifications } from "@/components/settings-notifications";
import { SettingsAppearance } from "@/components/settings-appearance";
import { SettingsUpdates } from "@/components/settings-updates";
import { useUpdater } from "@/hooks/use-updater";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export type SettingsSection = "account" | "appearance" | "notifications" | "ai" | "updates";

/** Impostazioni a tutta finestra: navigazione a sinistra, contenuto a destra (come nel design). */
export function SettingsPage({
  section,
  onSectionChange,
  onBack,
}: {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const { status } = useUpdater();

  const items: { id: SettingsSection; label: string; dot?: boolean }[] = [
    { id: "account", label: t("settings.nav.account") },
    { id: "appearance", label: t("settings.nav.appearance") },
    { id: "notifications", label: t("settings.nav.notifications") },
    { id: "ai", label: t("settings.nav.ai") },
    { id: "updates", label: t("settings.nav.updates"), dot: status === "available" },
  ];

  return (
    <div className="flex h-full min-h-0 bg-app-bg">
      <nav aria-label={t("settings.title")} className="w-[260px] shrink-0 border-r border-app-border bg-app-sidebar px-4 py-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-app-text-muted hover:bg-app-field hover:text-app-text"
        >
          <ArrowLeft className="size-4" strokeWidth={2} />
          {t("settings.back")}
        </button>
        <div className="px-3 pb-4 text-[22px] font-extrabold tracking-tight text-app-text-strong">
          {t("settings.title")}
        </div>
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const current = item.id === section;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={current ? "page" : undefined}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-[calc(10px*var(--radius-scale))] px-3 py-[11px] text-left text-[15px]",
                  current ? "bg-app-accent-soft font-bold text-app-text-strong" : "font-semibold text-app-text-soft hover:bg-app-field",
                )}
              >
                {item.label}
                {item.dot && <span className="size-2 rounded-full bg-app-accent-bright" />}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto px-[clamp(16px,5vw,64px)] py-8">
        {section === "account" && <SettingsAccount />}
        {section === "appearance" && <SettingsAppearance />}
        {section === "notifications" && <SettingsNotifications />}
        {section === "ai" && <SettingsAi />}
        {section === "updates" && <SettingsUpdates />}
      </main>
    </div>
  );
}

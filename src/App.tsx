import { useEffect, useState } from "react";
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AuthScreen } from "@/components/auth-screen";
import { ChatApp } from "@/components/chat-app";
import { SettingsPage, type SettingsSection } from "@/components/settings-page";
import { UpdateBanner } from "@/components/update-banner";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { useI18n } from "@/i18n/i18n-provider";

function Splash({ children }: { children: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-app-bg text-sm text-app-text-muted">{children}</div>
  );
}

function Session() {
  const { t } = useI18n();
  const [page, setPage] = useState<"chat" | "settings">("chat");
  const [section, setSection] = useState<SettingsSection>("account");
  const me = useQuery(api.users.me);
  const ensureProfile = useMutation(api.users.ensureProfile);

  // Prima volta che l'utente entra: crea il suo profilo nell'app (idempotente).
  useEffect(() => {
    if (me === null) void ensureProfile();
  }, [me, ensureProfile]);

  if (!me) return <Splash>{t("common.loadingProfile")}</Splash>;

  return (
    <SidebarProvider>
    <div className="flex h-screen flex-col bg-app-bg text-app-text">
      <UpdateBanner
        onOpenSettings={() => {
          setSection("updates");
          setPage("settings");
        }}
      />
      <div className="min-h-0 flex-1">
        {/* La chat resta montata sotto le impostazioni, così schede e pannelli non si perdono. */}
        <div className={page === "chat" ? "h-full" : "hidden"}>
          <ChatApp
            onOpenSettings={() => {
              setSection("account");
              setPage("settings");
            }}
          />
        </div>
        {page === "settings" && (
          <SettingsPage section={section} onSectionChange={setSection} onBack={() => setPage("chat")} />
        )}
      </div>
    </div>
    </SidebarProvider>
  );
}

export default function App() {
  const { t } = useI18n();

  return (
    <>
      <AuthLoading>
        <Splash>{t("common.loading")}</Splash>
      </AuthLoading>
      <Unauthenticated>
        <AuthScreen />
      </Unauthenticated>
      <Authenticated>
        <Session />
      </Authenticated>
    </>
  );
}

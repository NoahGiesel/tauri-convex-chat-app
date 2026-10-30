import { useState } from "react";
import { UpdateBanner } from "@/components/update-banner";
import { SettingsUpdates } from "@/components/settings-updates";

// Placeholder: la chat vera (Convex + Better Auth) arriva dopo.
// Intanto c'è lo scheletro per verificare che banner e pagina Aggiornamenti funzionino.
export default function App() {
  const [page, setPage] = useState<"chat" | "settings">("chat");

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <UpdateBanner onOpenSettings={() => setPage("settings")} />
      <header className="flex items-center gap-4 border-b px-4 py-2 text-sm">
        <button
          className={page === "chat" ? "font-semibold" : "text-muted-foreground"}
          onClick={() => setPage("chat")}
        >
          Chat
        </button>
        <button
          className={page === "settings" ? "font-semibold" : "text-muted-foreground"}
          onClick={() => setPage("settings")}
        >
          Impostazioni
        </button>
      </header>
      <main className="flex-1 overflow-auto p-6">
        {page === "chat" ? (
          <p className="text-muted-foreground">La chat arriverà qui.</p>
        ) : (
          <SettingsUpdates />
        )}
      </main>
    </div>
  );
}

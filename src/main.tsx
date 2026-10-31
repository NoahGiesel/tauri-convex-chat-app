import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider, type AuthClient } from "@convex-dev/better-auth/react";
import "./index.css";
import App from "./App";
import { UpdaterProvider } from "@/hooks/use-updater";
import { I18nProvider } from "@/i18n/i18n-provider";
import { authClient } from "@/lib/auth-client";
import { ThemeProvider } from "@/themes/theme-provider";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        {/* Il tipo inferito dei plugin (convex + crossDomain) non combacia con quello del provider, ma il client è lo stesso. */}
        <ConvexBetterAuthProvider client={convex} authClient={authClient as unknown as AuthClient}>
          <UpdaterProvider>
            <App />
          </UpdaterProvider>
        </ConvexBetterAuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);

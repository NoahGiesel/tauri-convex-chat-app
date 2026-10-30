import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Better Auth gira sulle HTTP actions di Convex (dominio `.convex.site`).
// `crossDomainClient` salva la sessione in localStorage invece che nei cookie,
// così funziona anche dentro la webview di Tauri (origini tauri://localhost, ecc.).
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  plugins: [convexClient(), crossDomainClient()],
});

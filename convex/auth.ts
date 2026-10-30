import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env } from "./_generated/server";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

// Origini da cui l'app desktop parla con il backend di autenticazione.
// Tauri serve il frontend da `tauri://localhost` (macOS) e `http(s)://tauri.localhost` (Windows).
const APP_ORIGINS = [
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://localhost:1420", // `pnpm tauri dev`
];

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = env.SITE_URL ?? "http://localhost:1420";
  return betterAuth({
    baseURL: env.CONVEX_SITE_URL,
    trustedOrigins: [...APP_ORIGINS, siteUrl],
    database: authComponent.adapter(ctx),
    // Email e password per cominciare; la verifica email e i social login si aggiungono dopo.
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });
};

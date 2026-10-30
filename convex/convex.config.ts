import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";

const app = defineApp({
  env: {
    // URL del frontend in sviluppo (es. http://localhost:1420). Impostala con `npx convex env set SITE_URL ...`
    SITE_URL: v.optional(v.string()),
  },
});
app.use(betterAuth);

export default app;

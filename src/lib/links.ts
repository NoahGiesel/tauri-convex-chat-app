import { openUrl } from "@tauri-apps/plugin-opener";
import { linkBrowserApp } from "@/lib/link-browser";

/** Apre un link nel browser scelto nelle impostazioni (o in quello di sistema). */
export async function openLink(url: string): Promise<void> {
  const app = linkBrowserApp();
  try {
    await openUrl(url, app);
  } catch {
    try {
      if (app) {
        await openUrl(url); // browser scelto non disponibile: usa quello di sistema
        return;
      }
    } catch {
      // passa al fallback
    }
    window.open(url, "_blank", "noopener,noreferrer"); // fuori da Tauri (es. `pnpm dev` nel browser)
  }
}

export { splitLinks, type TextPart } from "../../convex/linkRules";

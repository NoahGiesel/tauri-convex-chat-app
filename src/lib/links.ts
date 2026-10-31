import { openUrl } from "@tauri-apps/plugin-opener";

/** Apre un link nel browser di sistema (nella webview di Tauri `<a target="_blank">` non fa nulla). */
export async function openLink(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer"); // fuori da Tauri (es. `pnpm dev` nel browser)
  }
}

export { splitLinks, type TextPart } from "../../convex/linkRules";

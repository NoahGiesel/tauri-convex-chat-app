import { isTauri } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Parametro URL che trasforma l'app in una finestra con una sola chat. */
export const POPOUT_PARAM = "chat";

/** Id della chat se questa finestra è una finestra "staccata", altrimenti null. */
export function popoutChatId(): string | null {
  return new URLSearchParams(window.location.search).get(POPOUT_PARAM);
}

/**
 * Apre la chat in una nuova finestra (o porta in primo piano quella già aperta).
 * Restituisce true se la finestra è stata aperta, così la scheda può essere chiusa nella finestra principale.
 */
export async function openChatWindow(conversationId: string, title: string): Promise<boolean> {
  if (!isTauri()) {
    return window.open(`/?${POPOUT_PARAM}=${conversationId}`, "_blank", "popup,width=720,height=720") !== null;
  }
  const label = `chat-${conversationId}`;
  try {
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus();
      return true;
    }
    const created = new WebviewWindow(label, {
      url: `index.html?${POPOUT_PARAM}=${conversationId}`,
      title,
      width: 720,
      height: 720,
      minWidth: 420,
      minHeight: 360,
      dragDropEnabled: false,
    });
    return await new Promise<boolean>((resolve) => {
      void created.once("tauri://created", () => resolve(true));
      void created.once("tauri://error", () => resolve(false));
    });
  } catch {
    return false;
  }
}

import { invoke, isTauri } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Parametro URL che trasforma l'app in una finestra con una sola chat. */
export const POPOUT_PARAM = "chat";
/** Parametro URL che trasforma l'app nella finestra della Run di un Wordle Duel. */
export const RUN_PARAM = "wordle";

/** Id della chat se questa finestra è una finestra "staccata", altrimenti null. */
export function popoutChatId(): string | null {
  return new URLSearchParams(window.location.search).get(POPOUT_PARAM);
}

/** Id del Wordle Duel se questa finestra è quella della Run, altrimenti null. */
export function runWindowDuelId(): string | null {
  return new URLSearchParams(window.location.search).get(RUN_PARAM);
}

interface AppWindow {
  /** Etichetta Tauri, che deve essere permessa in `src-tauri/capabilities`; nel browser è il nome del popup. */
  label: string;
  /** Query string della finestra, es. `chat=<id>`. */
  query: string;
  title: string;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  /** Nel browser: riusa il popup già aperto con la stessa etichetta invece di aprirne uno nuovo. */
  reuseInBrowser?: boolean;
}

/**
 * Apre una finestra dell'app con la stessa sessione (o porta in primo piano quella già aperta con la stessa etichetta).
 * Nel browser è un popup. Restituisce true se la finestra è aperta.
 */
async function openAppWindow({ label, query, title, width, height, minWidth, minHeight, reuseInBrowser }: AppWindow): Promise<boolean> {
  if (!isTauri()) {
    const features = `popup,width=${width},height=${height}`;
    if (!reuseInBrowser) return window.open(`/?${query}`, "_blank", features) !== null;
    // Senza URL il popup già aperto non si ricarica; uno nuovo nasce vuoto e qui riceve l'indirizzo.
    const popup = window.open("", label, features);
    if (!popup) return false;
    if (popup.location.href === "about:blank") popup.location.href = `/?${query}`;
    popup.focus();
    return true;
  }
  try {
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus();
      return true;
    }
    const url = `index.html?${query}`;
    // Solo la build di test su macOS: la finestra staccata deve usare gli stessi dati dell'istanza che la apre,
    // e questo lo sa fare solo il lato nativo. Altrove il comando risponde con un errore e vale la strada normale.
    if (import.meta.env.VITE_E2E === "1") {
      if (await invoke("e2e_create_popout", { label, url, title }).then(() => true, () => false)) return true;
    }
    const created = new WebviewWindow(label, { url, title, width, height, minWidth, minHeight, dragDropEnabled: false });
    return await new Promise<boolean>((resolve) => {
      void created.once("tauri://created", () => resolve(true));
      void created.once("tauri://error", () => resolve(false));
    });
  } catch {
    return false;
  }
}

/**
 * Apre la chat in una nuova finestra (o porta in primo piano quella già aperta).
 * Restituisce true se la finestra è stata aperta, così la scheda può essere chiusa nella finestra principale.
 */
export function openChatWindow(conversationId: string, title: string): Promise<boolean> {
  return openAppWindow({
    label: `chat-${conversationId}`,
    query: `${POPOUT_PARAM}=${conversationId}`,
    title,
    width: 720,
    height: 720,
    minWidth: 420,
    minHeight: 360,
  });
}

/** Apre la finestra della Run di un Wordle Duel, o porta davanti quella già aperta. */
export function openRunWindow(duelId: string, title: string): Promise<boolean> {
  return openAppWindow({
    label: `wordle-${duelId}`,
    query: `${RUN_PARAM}=${duelId}`,
    title,
    width: 520,
    height: 820,
    minWidth: 420,
    minHeight: 640,
    reuseInBrowser: true,
  });
}

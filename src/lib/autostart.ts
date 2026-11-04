import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

/**
 * Avvio all'accesso. La voce nel sistema è l'unica fonte di verità: nessuna copia locale,
 * così lo stato resta giusto anche se l'utente la toglie fuori dall'app.
 */

/** Se l'app parte all'accesso, letto dal sistema; `null` se non si può leggere (per esempio fuori dall'app desktop). */
export async function readAutostart(): Promise<boolean | null> {
  try {
    return await isEnabled();
  } catch {
    return null;
  }
}

/**
 * Accende o spegne l'avvio all'accesso e restituisce lo stato reale letto dal sistema,
 * anche quando il sistema rifiuta la modifica.
 */
export async function setAutostart(on: boolean): Promise<boolean | null> {
  try {
    await (on ? enable() : disable());
  } catch {
    // ignora: vale lo stato letto qui sotto
  }
  return readAutostart();
}

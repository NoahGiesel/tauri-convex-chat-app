const KEY = "chat:link-browser";

export type BrowserId = "system" | "chrome" | "safari" | "firefox" | "edge" | "arc" | "brave";

const isMac = () => typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

/** Nome dell'app da passare a `openUrl` (macOS: `open -a`; Windows: nome eseguibile). */
const APP_NAMES: Record<Exclude<BrowserId, "system">, { mac: string; win: string | null }> = {
  chrome: { mac: "Google Chrome", win: "chrome" },
  safari: { mac: "Safari", win: null },
  firefox: { mac: "Firefox", win: "firefox" },
  edge: { mac: "Microsoft Edge", win: "msedge" },
  arc: { mac: "Arc", win: null },
  brave: { mac: "Brave Browser", win: "brave" },
};

/** Browser selezionabili sul sistema operativo corrente. */
export function availableBrowsers(): BrowserId[] {
  const all = Object.keys(APP_NAMES) as Exclude<BrowserId, "system">[];
  return ["system", ...all.filter((b) => isMac() || APP_NAMES[b].win)];
}

export function getLinkBrowser(): BrowserId {
  try {
    const v = localStorage.getItem(KEY) as BrowserId | null;
    return v && availableBrowsers().includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

export function setLinkBrowser(id: BrowserId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // ignora
  }
}

/** Nome app per `openUrl`, o `undefined` per il browser predefinito. */
export function linkBrowserApp(): string | undefined {
  const id = getLinkBrowser();
  if (id === "system") return undefined;
  const names = APP_NAMES[id];
  return (isMac() ? names.mac : names.win) ?? undefined;
}

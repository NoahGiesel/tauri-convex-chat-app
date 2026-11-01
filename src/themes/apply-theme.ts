import type { ResolvedTheme } from "./types";

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()).replace(/(\d+)/g, "-$1");

/**
 * Scrive il tema come variabili CSS su <html>:
 *  - i token di shadcn (--background, --primary, …), così tutti i componenti lo seguono;
 *  - un set `--app-*` per i colori specifici della chat (online, ai, upload, avatar…).
 * Le variabili inline vincono su quelle di `:root` / `.dark` nel CSS, quindi basta questo.
 */
/** Stondatura degli angoli: 0 = tutto squadrato, 1 = normale, oltre 1 = più arrotondato. */
export function applyRadius(scale: number): void {
  const root = document.documentElement;
  root.style.setProperty("--radius-scale", String(scale));
  root.style.setProperty("--radius", `${0.625 * scale}rem`); // base di rounded-sm … rounded-4xl (shadcn)
}

export function applyTheme(t: ResolvedTheme, mode: "dark" | "light" = "dark"): void {
  const root = document.documentElement;
  const set = (name: string, value: string) => root.style.setProperty(name, value);

  // shadcn
  set("--background", t.panel);
  set("--foreground", t.text);
  set("--card", t.sidebar);
  set("--card-foreground", t.text);
  set("--popover", t.raised);
  set("--popover-foreground", t.text);
  set("--primary", t.accent);
  set("--primary-foreground", t.accentFg);
  set("--secondary", t.field);
  set("--secondary-foreground", t.text);
  set("--muted", t.field);
  set("--muted-foreground", t.textMuted);
  set("--accent", t.accentSoft);
  set("--accent-foreground", t.textStrong);
  set("--destructive", "#e5484d");
  set("--border", t.border);
  set("--input", t.borderStrong);
  set("--ring", t.accent);
  set("--sidebar", t.sidebar);
  set("--sidebar-foreground", t.text);
  set("--sidebar-primary", t.accent);
  set("--sidebar-primary-foreground", t.accentFg);
  set("--sidebar-accent", t.accentSoft);
  set("--sidebar-accent-foreground", t.textStrong);
  set("--sidebar-border", t.border);
  set("--sidebar-ring", t.accent);

  // specifici dell'app: --app-bg, --app-text-dim, --app-online, --app-av-1, --app-art-0…
  for (const [key, value] of Object.entries(t)) {
    if (typeof value === "string") set(`--app-${kebab(key)}`, value);
    else value.forEach((v: string, i: number) => set(`--app-${key === "avatars" ? "av" : key}-${key === "avatars" ? i + 1 : i}`, v));
  }

  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
}

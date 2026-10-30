import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";
import { mix } from "@/themes/build-theme";
import { useTheme } from "@/themes/theme-provider";
import { cn } from "@/lib/utils";
import { outlineButtonClass, sectionLabelClass } from "@/lib/ui-classes";

/** Impostazioni › Aspetto: temi pronti, accento personalizzato e configurazione JSON importabile/esportabile. */
export function SettingsAppearance() {
  const { t } = useI18n();
  const { theme, themes, definition, preference, setTheme, setCustomAccent, exportTheme, importTheme } = useTheme();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const rows: { label: string; hex: string; editable?: boolean }[] = [
    { label: t("settings.appearance.accent"), hex: theme.accent, editable: true },
    { label: t("settings.appearance.background"), hex: theme.bg },
    { label: t("settings.appearance.sidebar"), hex: theme.sidebar },
    { label: t("settings.appearance.panel"), hex: theme.panel },
    { label: t("settings.appearance.text"), hex: theme.text },
    { label: t("settings.appearance.textMuted"), hex: theme.textMuted },
  ];

  const json = exportTheme();

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    const result = importTheme(await file.text());
    if (result === null) setMessage(null);
    else
      setMessage({
        kind: "error",
        text: t(result === "invalid_json" ? "settings.appearance.importInvalidJson" : "settings.appearance.importInvalidFormat"),
      });
  }

  async function onExport() {
    try {
      await navigator.clipboard.writeText(json);
      setMessage({ kind: "ok", text: t("settings.appearance.exported") });
    } catch {
      setMessage(null); // il JSON resta visibile qui sotto e si può copiare a mano
    }
  }

  return (
    <div className="flex max-w-[820px] flex-col gap-[26px]">
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-app-text-strong">{t("settings.nav.appearance")}</h1>
        <p className="mt-2 text-[15px] text-app-text-muted">{t("settings.appearance.subtitle")}</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className={sectionLabelClass}>{t("settings.appearance.themes")}</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3.5">
          {themes.map((p) => {
            const c = p.colors;
            const selected = p.id === definition.id && !preference.customAccent;
            const inUse = p.id === definition.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setTheme(p.id)}
                className={cn(
                  "flex flex-col gap-2.5 rounded-2xl border-2 bg-app-panel p-2.5 text-left",
                  inUse ? "border-app-accent" : "border-app-border hover:border-app-border-strong",
                )}
              >
                <div
                  className="flex h-[92px] overflow-hidden rounded-[10px] border"
                  style={{ background: c.panel, borderColor: c.border }}
                >
                  <div className="flex w-[32%] flex-col gap-1.5 p-2" style={{ background: c.sidebar }}>
                    <div className="h-2 rounded" style={{ background: c.field }} />
                    <div className="h-2 rounded" style={{ background: mix(c.accent, c.panel, 0.18) }} />
                    <div className="h-2 rounded" style={{ background: c.field }} />
                  </div>
                  <div className="flex flex-1 flex-col justify-center gap-[7px] p-2.5">
                    <div className="h-2.5 w-[62%] rounded-full" style={{ background: c.field }} />
                    <div className="h-2.5 w-[44%] self-end rounded-full" style={{ background: c.accent }} />
                    <div className="h-2.5 w-[54%] rounded-full" style={{ background: c.field }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-[15px] font-extrabold text-app-text-strong">{p.name}</span>
                  {selected && (
                    <span className="rounded-full bg-app-accent px-2 py-0.5 text-[11px] font-extrabold text-app-accent-fg">
                      {t("settings.appearance.inUse")}
                    </span>
                  )}
                </div>
                {p.description && <div className="text-xs leading-snug text-app-text-muted">{p.description}</div>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className={cn(sectionLabelClass, "flex-1")}>{t("settings.appearance.colors")}</h2>
          {preference.customAccent && (
            <button
              type="button"
              onClick={() => setCustomAccent(null)}
              className="rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-app-accent-text hover:bg-app-field"
            >
              {t("settings.appearance.resetAccent")}
            </button>
          )}
        </div>
        <div className="rounded-2xl border border-app-border bg-app-panel px-5 py-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3.5 border-b border-app-border py-3 last:border-b-0">
              <div className="size-[30px] rounded-[9px] border border-app-border-strong" style={{ background: r.hex }} />
              <div className="flex-1 text-[15px] font-semibold text-app-text">{r.label}</div>
              <code className="rounded-lg bg-app-field px-2.5 py-1 font-mono text-[13px] text-app-text-soft">{r.hex}</code>
              {r.editable ? (
                <label
                  title={t("settings.appearance.customAccent")}
                  className="relative flex size-9 cursor-pointer items-center justify-center rounded-[10px] text-app-text-muted hover:bg-app-field"
                >
                  <Pencil className="size-[18px]" strokeWidth={1.8} />
                  <input
                    type="color"
                    aria-label={t("settings.appearance.customAccent")}
                    value={r.hex.slice(0, 7)}
                    onChange={(e) => setCustomAccent(e.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </label>
              ) : (
                <span className="size-9" />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className={cn(sectionLabelClass, "flex-1")}>{t("settings.appearance.config")}</h2>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onImportFile(e.target.files?.[0]);
              e.target.value = ""; // permette di reimportare lo stesso file
            }}
          />
          <button type="button" onClick={() => fileInput.current?.click()} className={cn(outlineButtonClass, "h-[38px] px-3.5 text-sm")}>
            {t("settings.appearance.import")}
          </button>
          <button type="button" onClick={() => void onExport()} className={cn(outlineButtonClass, "h-[38px] px-3.5 text-sm")}>
            {t("settings.appearance.export")}
          </button>
        </div>
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={cn("text-sm", message.kind === "error" ? "text-destructive" : "text-app-online")}>
            {message.text}
          </p>
        )}
        <pre className="max-h-60 overflow-auto rounded-[14px] border border-app-border bg-app-sidebar p-4 font-mono text-[12.5px] leading-relaxed text-app-text-soft">
          {json}
        </pre>
      </section>
    </div>
  );
}

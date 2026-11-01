import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { RefreshCw } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { outlineButtonClass } from "@/lib/ui-classes";

interface Usage {
  model: string;
  limit: number | null;
  remaining: number | null;
  used: number | null;
  resets: "daily" | "weekly" | "monthly" | null;
  daily: number;
  weekly: number;
  monthly: number;
  total: number;
}

/** Impostazioni › AI: quanto è stato speso con la chiave OpenRouter dell'AI helper rispetto al suo budget. */
export function SettingsAi() {
  const { t, locale } = useI18n();
  const fetchUsage = useAction(api.aiUsage.get);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsage((await fetchUsage({})) as Usage);
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setLoading(false);
    }
  }, [fetchUsage, t]);

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 }).format(n);
  const percent = usage && usage.limit && usage.used !== null ? Math.min(100, (usage.used / usage.limit) * 100) : null;
  const high = percent !== null && percent >= 80;

  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-extrabold tracking-tight text-app-text-strong">{t("settings.nav.ai")}</h1>
        <p className="mt-2 text-[15px] text-app-text-muted">{t("settings.ai.subtitle")}</p>
      </div>

      <section className="flex flex-col gap-4 rounded-[calc(18px*var(--radius-scale))] border border-app-border bg-app-panel p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-app-text-strong">{t("settings.ai.budget")}</h2>
            {usage && <p className="mt-1 truncate font-mono text-xs text-app-text-dim">{usage.model}</p>}
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            aria-label={t("settings.ai.refresh")}
            title={t("settings.ai.refresh")}
            className={cn(outlineButtonClass, "h-9 px-3 text-sm")}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} strokeWidth={2} />
          </button>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!usage && loading && <p className="text-sm text-app-text-muted">{t("auth.busy")}</p>}

        {usage && (
          <>
            {percent !== null && usage.limit !== null && usage.used !== null ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[28px] font-extrabold tracking-tight text-app-text-strong">{money(usage.used)}</span>
                  <span className="text-sm text-app-text-muted">
                    {t("settings.ai.ofLimit", { limit: money(usage.limit) })}
                    {usage.resets && ` · ${t(`settings.ai.reset.${usage.resets}`)}`}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percent)}
                  className="h-2.5 w-full overflow-hidden rounded-full bg-app-field"
                >
                  <div className={cn("h-full rounded-full transition-all", high ? "bg-destructive" : "bg-app-accent")} style={{ width: `${percent}%` }} />
                </div>
                <div className={cn("text-sm", high ? "font-semibold text-destructive" : "text-app-text-muted")}>
                  {t("settings.ai.remaining", { amount: money(Math.max(0, usage.remaining ?? 0)), percent: Math.round(100 - percent) })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-app-text-muted">{t("settings.ai.noLimit")}</p>
            )}

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["settings.ai.today", usage.daily],
                  ["settings.ai.week", usage.weekly],
                  ["settings.ai.month", usage.monthly],
                  ["settings.ai.total", usage.total],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-xl border border-app-border bg-app-bg px-3 py-2.5">
                  <dt className="text-xs text-app-text-dim">{t(label)}</dt>
                  <dd className="mt-0.5 text-[15px] font-bold text-app-text-strong">{money(value)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>
    </div>
  );
}

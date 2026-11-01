import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { fail, getProfile } from "./model";
import { aiModel } from "./summaryPrompt";

export const requireUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    if (!(await getProfile(ctx))) throw fail("not_authenticated");
    return null;
  },
});

interface KeyInfo {
  data?: {
    limit?: number | null;
    limit_remaining?: number | null;
    limit_reset?: string | null;
    usage?: number;
    usage_daily?: number;
    usage_weekly?: number;
    usage_monthly?: number;
  };
}

/** Consumo della chiave OpenRouter rispetto al suo budget (in dollari). La chiave resta sul server. */
export const get = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runQuery(internal.aiUsage.requireUser, {});
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw fail("summary_not_configured");

    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res || !res.ok) throw fail("usage_unavailable");

    const d = ((await res.json()) as KeyInfo).data;
    if (!d) throw fail("usage_unavailable");
    const limit = typeof d.limit === "number" ? d.limit : null;
    const remaining = typeof d.limit_remaining === "number" ? d.limit_remaining : null;
    return {
      model: aiModel(),
      limit,
      remaining,
      used: limit !== null && remaining !== null ? Math.max(0, limit - remaining) : null,
      resets: d.limit_reset === "daily" || d.limit_reset === "weekly" || d.limit_reset === "monthly" ? d.limit_reset : null,
      daily: d.usage_daily ?? 0,
      weekly: d.usage_weekly ?? 0,
      monthly: d.usage_monthly ?? 0,
      total: d.usage ?? 0,
    };
  },
});

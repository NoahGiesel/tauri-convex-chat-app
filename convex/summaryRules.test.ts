/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { askState, blocksNewSummary, SUMMARY_STALE_MS, summaryState } from "./summaryRules";

const modules = import.meta.glob("./**/*.ts");

describe("stored-status rules", () => {
  it("reads the stored status, defaulting to done", () => {
    expect(summaryState({ summaryStatus: "pending" })).toBe("pending");
    expect(summaryState({ summaryStatus: "failed" })).toBe("failed");
    expect(summaryState({})).toBe("done");
    expect(askState({ askStatus: "pending" })).toBe("pending");
    expect(askState({ askStatus: "failed" })).toBe("failed");
    expect(askState({})).toBe("done");
  });

  it("blocks a new summary unless the previous one failed", () => {
    expect(blocksNewSummary(null)).toBe(false);
    expect(blocksNewSummary({ summaryStatus: "pending" })).toBe(true);
    expect(blocksNewSummary({ summaryStatus: "done" })).toBe(true);
    expect(blocksNewSummary({ summaryStatus: "failed" })).toBe(false);
  });
});

describe("stale pending transition", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function seed(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const profileId = await ctx.db.insert("profiles", { tokenIdentifier: "t", name: "A", email: "a@example.com", avatarIndex: 0 });
      const conversationId = await ctx.db.insert("conversations", { kind: "group", createdBy: profileId, lastMessageAt: Date.now() });
      const summary = await ctx.db.insert("messages", { conversationId, kind: "ai", body: "", requestedBy: profileId, summaryStatus: "pending" });
      const ask = await ctx.db.insert("messages", { conversationId, kind: "ai", body: "", requestedBy: profileId, askStatus: "pending" });
      return { summary, ask };
    });
  }

  it("markStale fails only messages still pending", async () => {
    const t = convexTest(schema, modules);
    const { summary, ask } = await seed(t);
    await t.mutation(internal.summary.markStale, { messageId: summary });
    await t.mutation(internal.ask.markStale, { messageId: ask });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(summary))?.summaryStatus).toBe("failed");
      expect((await ctx.db.get(ask))?.askStatus).toBe("failed");
      await ctx.db.patch(summary, { summaryStatus: "done" });
    });
    await t.mutation(internal.summary.markStale, { messageId: summary });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(summary))?.summaryStatus).toBe("done");
    });
  });

  it("failStalePending only touches old pending rows", async () => {
    const t = convexTest(schema, modules);
    const { summary, ask } = await seed(t);
    expect(await t.mutation(internal.summary.failStalePending, {})).toBe(0);
    vi.setSystemTime(Date.now() + SUMMARY_STALE_MS + 1000);
    expect(await t.mutation(internal.summary.failStalePending, {})).toBe(2);
    await t.run(async (ctx) => {
      expect((await ctx.db.get(summary))?.summaryStatus).toBe("failed");
      expect((await ctx.db.get(ask))?.askStatus).toBe("failed");
    });
  });
});

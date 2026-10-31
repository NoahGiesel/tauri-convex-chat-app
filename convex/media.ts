import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalQuery } from "./_generated/server";
import { classifyMedia } from "./mediaRules";
import { fail, requireMember, requireProfile } from "./model";
import { r2 } from "./r2";

/** Le action non vedono il database: il controllo "sei membro della chat" passa da qui. */
export const authorize = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args): Promise<null> => {
    const me = await requireProfile(ctx);
    await requireMember(ctx, args.conversationId, me._id);
    return null;
  },
});

/** URL firmato (10 minuti) con cui il client carica il file direttamente su R2. */
export const createUpload = action({
  args: { conversationId: v.id("conversations"), mime: v.string(), size: v.number() },
  handler: async (ctx, args): Promise<{ key: string; uploadUrl: string }> => {
    await ctx.runQuery(internal.media.authorize, { conversationId: args.conversationId });
    const check = classifyMedia(args.mime, args.size);
    if (!check.ok) throw fail(check.reason);

    const key = `${args.conversationId}/${crypto.randomUUID()}.${check.ext}`;
    const { client, endpoint } = r2();
    const url = new URL(`${endpoint}/${key}`);
    url.searchParams.set("X-Amz-Expires", "600");
    const signed = await client.sign(new Request(url, { method: "PUT", headers: { "Content-Type": args.mime } }), {
      aws: { signQuery: true },
    });
    return { key, uploadUrl: signed.url };
  },
});

/** Cancella il file da R2 quando il messaggio viene eliminato. */
export const deleteObject = internalAction({
  args: { key: v.string() },
  handler: async (_ctx, args): Promise<null> => {
    const { client, endpoint } = r2();
    const res = await client.fetch(`${endpoint}/${args.key}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) console.error("R2 delete failed", res.status, args.key);
    return null;
  },
});

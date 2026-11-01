import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { carriesLinks } from "./linkRules";
import { fail, getProfile, requireMember } from "./model";
import { aiModel } from "./summaryPrompt";

const MAX_PROMPT = 4000;
const CONTEXT_MESSAGES = 12;
const CONTEXT_CHARS = 600;
const MAX_OUTPUT_TOKENS = 1500;

const SOURCES_LABEL: Record<string, string> = { en: "Sources", it: "Fonti", de: "Quellen", ro: "Surse", es: "Fuentes" };
const MAX_SOURCES = 5;

const LANGUAGES: Record<string, string> = { en: "English", it: "Italian", de: "German", ro: "Romanian", es: "Spanish" };

const systemPrompt = (language: string) => `You are "AI helper", an assistant inside a private chat between friends.

- Do what the user asks and answer helpfully, directly and concisely.
- Use the recent chat messages as context only when they are relevant to the request.
- Do not help with anything illegal, harmful or abusive (for example weapons, malware, fraud, harassment, or sexual content involving minors). Decline briefly and politely, and offer a safe alternative when one exists.
- You can search the web: use it for anything current or time-sensitive (weather, news, prices, scores, recent events) and say when information comes from a search. Do not invent facts; if you are unsure, say so.
- Use light Markdown (bold, short bullet lists, short headings) only when it makes the answer clearer.
- Reply in ${LANGUAGES[language] ?? "English"}, unless the user writes to you in another language.`;

/** Pubblica la domanda e, subito sotto, una risposta "in corso" da riempire poi con `finish`. */
export const begin = internalMutation({
  args: { conversationId: v.id("conversations"), prompt: v.string() },
  handler: async (ctx, args) => {
    const me = await getProfile(ctx);
    if (!me) throw fail("not_authenticated");
    await requireMember(ctx, args.conversationId, me._id);
    const prompt = args.prompt.trim();
    if (prompt.length === 0) throw fail("message_empty");
    if (prompt.length > MAX_PROMPT) throw fail("message_too_long");

    const body = `/ask ${prompt}`;
    const now = Date.now();
    // Il contesto è fatto dai messaggi precedenti alla domanda.
    const previous = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .take(CONTEXT_MESSAGES);
    const context: string[] = [];
    const names = new Map<string, string>();
    for (const m of previous.reverse()) {
      if (m.kind !== "text" && m.kind !== "ai") continue;
      if (m.kind === "ai" && m.summaryOf) continue; // le trascrizioni lunghe non servono come contesto
      let who = "AI helper";
      if (m.authorId) {
        if (!names.has(m.authorId)) names.set(m.authorId, (await ctx.db.get("profiles", m.authorId))?.name ?? "?");
        who = names.get(m.authorId)!;
      }
      context.push(`${who}: ${m.body.slice(0, CONTEXT_CHARS)}`);
    }

    const questionId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      authorId: me._id,
      kind: "text",
      body,
      hasLink: carriesLinks("text", null, body) ? true : undefined,
    });
    const answerId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      kind: "ai",
      body: "",
      requestedBy: me._id,
      askOf: questionId,
      askStatus: "pending",
    });
    await ctx.db.patch("conversations", args.conversationId, { lastMessageAt: now });
    const members = await ctx.db.query("members").withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId)).take(50);
    for (const m of members) {
      await ctx.db.patch("members", m._id, m.profileId === me._id ? { lastMessageAt: now, lastReadAt: now } : { lastMessageAt: now });
    }
    return { answerId, prompt, context: context.join("\n"), name: me.name };
  },
});

export const finish = internalMutation({
  args: { messageId: v.id("messages"), body: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("messages", args.messageId, { body: args.body, askStatus: "done" });
  },
});

/** Se qualcosa va storto la risposta "in corso" sparisce (la domanda resta). */
export const abort = internalMutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    if (await ctx.db.get("messages", args.messageId)) await ctx.db.delete("messages", args.messageId);
  },
});

/** /ask: risponde a quello che gli si chiede, tenendo conto degli ultimi messaggi della chat. */
export const ask = action({
  args: { conversationId: v.id("conversations"), prompt: v.string(), language: v.string() },
  handler: async (ctx, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw fail("summary_not_configured");

    const started = await ctx.runMutation(internal.ask.begin, { conversationId: args.conversationId, prompt: args.prompt });
    try {
      const userContent = `${started.context ? `Recent chat messages (oldest first):\n${started.context}\n\n` : ""}Request from ${started.name}:\n${started.prompt}`;
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Friends Chat" },
        body: JSON.stringify({
          model: aiModel(),
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.6,
          plugins: [{ id: "web" }], // ricerca sul web (OpenRouter): senza, il modello non conosce nulla di attuale
          messages: [
            { role: "system", content: systemPrompt(args.language) },
            { role: "user", content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      }).catch(() => null);
      if (!res || !res.ok) {
        console.error("OpenRouter ask", res?.status, await res?.text().catch(() => ""));
        throw fail("summary_failed");
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string; annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[] } }[];
      };
      const message = data.choices?.[0]?.message;
      let text = message?.content?.trim();
      if (!text) throw fail("summary_failed");

      // Le fonti usate dalla ricerca sul web, sotto la risposta.
      const seen = new Set<string>();
      const sources: string[] = [];
      for (const a of message?.annotations ?? []) {
        const url = a.type === "url_citation" ? a.url_citation?.url : undefined;
        if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) continue;
        seen.add(url);
        const title = a.url_citation?.title?.replace(/\s+/g, " ").trim().slice(0, 80);
        sources.push(title ? `- ${title} — ${url}` : `- ${url}`);
        if (sources.length >= MAX_SOURCES) break;
      }
      if (sources.length > 0) text = `${text}\n\n## ${SOURCES_LABEL[args.language] ?? "Sources"}\n${sources.join("\n")}`;

      await ctx.runMutation(internal.ask.finish, { messageId: started.answerId, body: text.slice(0, 20_000) });
    } catch (e) {
      await ctx.runMutation(internal.ask.abort, { messageId: started.answerId });
      if (e instanceof ConvexError) throw e;
      throw fail("summary_failed");
    }
  },
});

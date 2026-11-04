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

const LANGUAGES: Record<string, string> = { en: "English", it: "Italian", de: "German", ro: "Romanian", es: "Spanish" };

const systemPrompt = (language: string) => `You are "AI helper", an assistant inside a private chat between friends.

- Do what the user asks and answer helpfully, directly and concisely.
- Use the recent chat messages as context only when they are relevant to the request.
- Do not help with anything illegal, harmful or abusive (for example weapons, malware, fraud, harassment, or sexual content involving minors). Decline briefly and politely, and offer a safe alternative when one exists.
- You can search the web: use it for anything current or time-sensitive (weather, news, prices, scores, recent events) and say when information comes from a search. Do not invent facts; if you are unsure, say so.
- When a fact comes from a web search, cite it at the end of the paragraph or bullet it supports, on the same line, as a short Markdown link to the page (for example [ansa.it](https://www.ansa.it/...)), never in the middle of a sentence or on a line of its own. Never add a separate list of sources or a "Sources" section at the end.
- Use light Markdown (bold, short bullet lists, short headings) only when it makes the answer clearer.
- Reply in ${LANGUAGES[language] ?? "English"}, unless the user writes to you in another language.`;

type Annotation = { type?: string; url_citation?: { url?: string; title?: string; start_index?: number; end_index?: number } };

const SOURCE_WORD: Record<string, string> = { en: "source", it: "fonte", de: "Quelle", ro: "sursă", es: "fuente" };

function withInlineCitations(text: string, annotations: Annotation[], language: string): string {
  const found: { at: number; url: string }[] = [];
  const seen = new Set<string>();
  for (const a of annotations) {
    const c = a.type === "url_citation" ? a.url_citation : undefined;
    const url = c?.url;
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url) || text.includes(url)) continue;
    seen.add(url);
    const end = c?.end_index;
    // Senza una posizione valida la fonte va comunque in fondo alla risposta: meglio in fondo che persa.
    found.push({ at: typeof end === "number" && end >= 0 && end <= text.length ? end : text.length, url });
  }
  found.sort((x, y) => x.at - y.at);
  // Ogni fonte va in coda alla riga (paragrafo o punto elenco) a cui appartiene, mai in mezzo alla frase né a capo da sola.
  // Se cade su un titolo, va in coda al testo di quella sezione (fino al titolo successivo).
  const sectionEnd = (rawAt: number): number => {
    const at = text.slice(0, rawAt).trimEnd().length; // se cade dopo un a capo, risale alla riga precedente
    const nl = text.indexOf("\n", at);
    const lineStart = text.lastIndexOf("\n", at - 1) + 1;
    let end = nl < 0 ? text.length : nl;
    if (/^#{1,6}\s/.test(text.slice(lineStart, end))) {
      const next = /\n#{1,6}\s/.exec(text.slice(end));
      end = next ? end + next.index : text.length;
    }
    return text.slice(0, end).trimEnd().length;
  };
  // "fonte 1", "fonte 2"… numerate nell'ordine in cui compaiono, e raggruppate per sezione.
  const word = SOURCE_WORD[language] ?? "source";
  const groups: { at: number; links: string[] }[] = [];
  found.forEach((f, i) => {
    const link = `[${word} ${i + 1}](${f.url})`;
    const at = sectionEnd(f.at);
    const last = groups[groups.length - 1];
    if (last && last.at === at) last.links.push(link);
    else groups.push({ at, links: [link] });
  });
  // Dal fondo verso l'inizio, così le posizioni già calcolate non si spostano.
  for (const g of groups.reverse()) text = `${text.slice(0, g.at)} ${g.links.join(" ")}${text.slice(g.at)}`;
  return text;
}

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
        choices?: { message?: { content?: string; annotations?: Annotation[] } }[];
      };
      const message = data.choices?.[0]?.message;
      // Le posizioni delle citazioni si riferiscono al testo com'è arrivato, quindi si aggiungono prima di togliere gli spazi.
      if (!message?.content?.trim()) throw fail("summary_failed");
      console.log("ask annotations", JSON.stringify(message.annotations ?? []).slice(0, 1500));

      // Citazioni in coda alla riga o sezione a cui appartengono: i link che il modello non ha già scritto nel testo si aggiungono
      // in coda a quella sezione (la sezione la dà la posizione che indica OpenRouter), mai in una lista a parte.
      const text = withInlineCitations(message.content, message.annotations ?? [], args.language).trim();

      await ctx.runMutation(internal.ask.finish, { messageId: started.answerId, body: text.slice(0, 20_000) });
    } catch (e) {
      await ctx.runMutation(internal.ask.abort, { messageId: started.answerId });
      if (e instanceof ConvexError) throw e;
      throw fail("summary_failed");
    }
  },
});

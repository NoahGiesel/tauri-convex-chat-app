/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { parseHtml } from "./previews";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const base = new URL("https://example.com/articles/one");
const HOUR = 60 * 60 * 1000;

describe("parseHtml", () => {
  it("reads the Open Graph tags", () => {
    const html = `<head>
      <title>Ignored</title>
      <meta property="og:title" content="A title">
      <meta property="og:description" content="A description">
      <meta property="og:site_name" content="A site">
      <meta property="og:image" content="https://cdn.example.com/a.png">
    </head>`;
    expect(parseHtml(html, base)).toEqual({
      title: "A title",
      description: "A description",
      siteName: "A site",
      image: "https://cdn.example.com/a.png",
    });
  });

  it("falls back on Twitter cards, then on the page title and description", () => {
    expect(parseHtml(`<meta name="twitter:title" content="Card title"><title>Page</title>`, base).title).toBe("Card title");
    expect(parseHtml(`<title>Page</title><meta name="description" content="Plain">`, base)).toMatchObject({ title: "Page", description: "Plain" });
  });

  it("reads attributes in any order and with either quote", () => {
    expect(parseHtml(`<meta content='Reversed' property='og:title'>`, base).title).toBe("Reversed");
  });

  it("decodes entities and tidies spaces", () => {
    expect(parseHtml(`<title>  Tom &amp; Jerry&#39;s\n   &#x263A; </title>`, base).title).toBe("Tom & Jerry's ☺");
  });

  it("resolves a relative image against the page", () => {
    expect(parseHtml(`<meta property="og:image" content="/a.png">`, base).image).toBe("https://example.com/a.png");
  });

  it("drops an image that is not https", () => {
    expect(parseHtml(`<meta property="og:image" content="http://example.com/a.png">`, base).image).toBeUndefined();
  });

  it("cuts a long title to 200 characters", () => {
    expect(parseHtml(`<title>${"a".repeat(300)}</title>`, base).title).toHaveLength(200);
  });

  it("finds nothing in a page with no tags", () => {
    expect(parseHtml("<p>Hello</p>", base)).toEqual({ title: undefined, description: undefined, siteName: undefined, image: undefined });
  });
});

describe("fetchPreview", () => {
  const page = (html: string, init?: ResponseInit) => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" }, ...init });
  const titled = () => page(`<meta property="og:title" content="A title">`);
  let requests: string[];
  let unexpected: string[];

  /**
   * Niente esce dalla macchina. `fetchPreview` inghiotte gli errori, quindi un indirizzo senza
   * risposta non può fallire da solo: finisce in `unexpected`, che `afterEach` controlla.
   */
  function stubFetch(routes: Record<string, () => Response>) {
    vi.stubGlobal("fetch", async (input: URL | string) => {
      const url = String(input);
      requests.push(url);
      const route = routes[url];
      if (route) return route();
      unexpected.push(url);
      throw new Error(`a test asked for ${url}`);
    });
  }

  async function signedIn() {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("profiles", { tokenIdentifier: "test|alice", name: "Alice", email: "alice@example.com", avatarIndex: 0 }),
    );
    return { t, alice: t.withIdentity({ tokenIdentifier: "test|alice" }) };
  }

  const oembed = (url: string) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;

  beforeEach(() => {
    requests = [];
    unexpected = [];
    stubFetch({});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    expect(unexpected).toEqual([]);
  });

  it("saves what the page says", async () => {
    const { alice } = await signedIn();
    const url = "https://example.com/a";
    stubFetch({ [url]: () => page(`<meta property="og:title" content="A title"><meta property="og:description" content="Words">`) });

    await alice.action(api.previews.fetchPreview, { url });

    expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: true, title: "A title", description: "Words" });
  });

  it("asks YouTube's lookup for a video, and does not load the page", async () => {
    const { alice } = await signedIn();
    const url = "https://www.youtube.com/watch?v=abc";
    stubFetch({
      [oembed(url)]: () => Response.json({ title: "A video", author_name: "A channel", thumbnail_url: "https://i.ytimg.com/a.jpg" }),
    });

    await alice.action(api.previews.fetchPreview, { url });

    expect(requests).toEqual([oembed(url)]);
    expect(await alice.query(api.previews.get, { url })).toMatchObject({
      ok: true,
      title: "A video",
      description: "A channel",
      image: "https://i.ytimg.com/a.jpg",
      siteName: "YouTube",
    });
  });

  it("recognises the short YouTube address", async () => {
    const { alice } = await signedIn();
    const url = "https://youtu.be/abc";
    stubFetch({ [oembed(url)]: () => Response.json({ title: "A short link" }) });

    await alice.action(api.previews.fetchPreview, { url });

    expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: true, title: "A short link" });
  });

  it("drops a YouTube thumbnail that is not https", async () => {
    const { alice } = await signedIn();
    const url = "https://youtu.be/abc";
    stubFetch({ [oembed(url)]: () => Response.json({ title: "A video", thumbnail_url: "http://i.ytimg.com/a.jpg" }) });

    await alice.action(api.previews.fetchPreview, { url });

    expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: true, image: null });
  });

  it("falls back on the page when YouTube's lookup fails", async () => {
    const { alice } = await signedIn();
    const url = "https://www.youtube.com/watch?v=abc";
    stubFetch({ [oembed(url)]: () => new Response("", { status: 404 }), [url]: titled });

    await alice.action(api.previews.fetchPreview, { url });

    expect(requests).toEqual([oembed(url), url]);
    expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: true, title: "A title" });
  });

  it("falls back on the page when YouTube's lookup cannot be reached", async () => {
    const { alice } = await signedIn();
    const url = "https://www.youtube.com/watch?v=abc";
    stubFetch({
      [oembed(url)]: () => {
        throw new Error("offline");
      },
      [url]: titled,
    });

    await alice.action(api.previews.fetchPreview, { url });

    expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: true, title: "A title" });
  });

  it("follows a redirect to a public site", async () => {
    const { alice } = await signedIn();
    const url = "https://example.com/old";
    stubFetch({
      [url]: () => new Response(null, { status: 301, headers: { location: "/new" } }),
      "https://example.com/new": titled,
    });

    await alice.action(api.previews.fetchPreview, { url });

    expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: true, title: "A title" });
  });

  it("refuses a redirect to a private address, and remembers the failure", async () => {
    const { alice } = await signedIn();
    const url = "https://example.com/trap";
    stubFetch({ [url]: () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }) });

    await alice.action(api.previews.fetchPreview, { url });

    expect(requests).toEqual([url]);
    expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: false, title: null });
  });

  it("stops after three redirects", async () => {
    const { alice } = await signedIn();
    const url = "https://example.com/loop";
    stubFetch({ [url]: () => new Response(null, { status: 302, headers: { location: url } }) });

    await alice.action(api.previews.fetchPreview, { url });

    expect(requests).toHaveLength(4);
    expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: false });
  });

  for (const [what, url] of [
    ["localhost", "http://localhost/a"],
    ["a numeric address", "http://10.0.0.1/a"],
    ["a local name", "https://printer.local/a"],
    ["a port of its own", "https://example.com:8443/a"],
    ["a password in the address", "https://user:secret@example.com/a"],
    ["another protocol", "ftp://example.com/a"],
  ]) {
    it(`never fetches ${what}`, async () => {
      const { alice } = await signedIn();
      stubFetch({});

      await alice.action(api.previews.fetchPreview, { url });

      expect(requests).toEqual([]);
      expect(await alice.query(api.previews.get, { url })).toBeNull();
    });
  }

  // Ognuna di queste pagine ha un titolo: si deve fermare il controllo in esame, non la mancanza del titolo.
  const TITLE = `<meta property="og:title" content="A title">`;
  for (const [what, response] of [
    ["is not HTML", () => new Response(TITLE, { headers: { "content-type": "application/json" } })],
    ["answers with an error", () => page(TITLE, { status: 410 })],
    ["has neither title nor image", () => page("<p>Hello</p>")],
    ["cannot be reached", () => { throw new Error("offline"); }],
  ] as const) {
    it(`saves a failure when the page ${what}`, async () => {
      const { alice } = await signedIn();
      const url = "https://example.com/a";
      stubFetch({ [url]: response });

      await alice.action(api.previews.fetchPreview, { url });

      expect(requests).toEqual([url]);
      expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: false, title: null });
    });
  }

  it("stops reading a page after 300 KB", async () => {
    const { alice } = await signedIn();
    const url = "https://example.com/huge";
    const bytes = new TextEncoder();
    const parts = [bytes.encode(" ".repeat(300_000)), bytes.encode(TITLE)];
    stubFetch({
      [url]: () =>
        new Response(new ReadableStream({ pull: (reader) => void (parts.length ? reader.enqueue(parts.shift()) : reader.close()) }), {
          headers: { "content-type": "text/html" },
        }),
    });

    await alice.action(api.previews.fetchPreview, { url });

    expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: false, title: null });
  });

  it("never fetches a saved preview again, however old it is", async () => {
    const { t, alice } = await signedIn();
    const url = "https://example.com/a";
    stubFetch({ [url]: titled });

    await alice.action(api.previews.fetchPreview, { url });
    await t.run(async (ctx) => {
      const saved = await ctx.db.query("linkPreviews").first();
      await ctx.db.patch("linkPreviews", saved!._id, { fetchedAt: Date.now() - HOUR - 1 });
    });
    await alice.action(api.previews.fetchPreview, { url });

    expect(requests).toEqual([url]);
  });

  describe("after a failure", () => {
    const url = "https://example.com/a";

    async function failedOnce() {
      const session = await signedIn();
      stubFetch({ [url]: () => new Response("", { status: 500 }) });
      await session.alice.action(api.previews.fetchPreview, { url });
      requests = [];
      return session;
    }

    it("waits an hour before trying again", async () => {
      const { alice } = await failedOnce();

      await alice.action(api.previews.fetchPreview, { url });

      expect(requests).toEqual([]);
    });

    it("tries again once the hour has passed", async () => {
      const { t, alice } = await failedOnce();
      await t.run(async (ctx) => {
        const saved = await ctx.db.query("linkPreviews").first();
        await ctx.db.patch("linkPreviews", saved!._id, { fetchedAt: Date.now() - HOUR - 1 });
      });
      stubFetch({ [url]: titled });

      await alice.action(api.previews.fetchPreview, { url });

      expect(await alice.query(api.previews.get, { url })).toMatchObject({ ok: true, title: "A title" });
    });
  });

  it("refuses someone who is not signed in", async () => {
    const { t } = await signedIn();
    stubFetch({});

    await expect(t.action(api.previews.fetchPreview, { url: "https://example.com/a" })).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The address is read once, when the module loads, so each test loads it afresh. */
async function requestedUrl() {
  vi.resetModules();
  const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ data: [] })));
  vi.stubGlobal("fetch", fetchMock);
  const { fetchGifs } = await import("./giphy");
  await fetchGifs("cats", "en", new AbortController().signal);
  return new URL(String(fetchMock.mock.calls[0][0]));
}

beforeEach(() => {
  vi.stubEnv("VITE_GIPHY_API_KEY", "key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the GIPHY address", () => {
  it("is GIPHY's own when no address is set", async () => {
    vi.stubEnv("VITE_GIPHY_API_URL", "");
    const url = await requestedUrl();
    expect(url.origin + url.pathname).toBe("https://api.giphy.com/v1/gifs/search");
  });

  it("is the set address, for the E2E stub", async () => {
    vi.stubEnv("VITE_GIPHY_API_URL", "http://127.0.0.1:3312/v1/gifs");
    const url = await requestedUrl();
    expect(url.origin + url.pathname).toBe("http://127.0.0.1:3312/v1/gifs/search");
    expect(url.searchParams.get("q")).toBe("cats");
  });
});

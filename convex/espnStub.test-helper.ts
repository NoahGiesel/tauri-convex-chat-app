/// <reference types="vite/client" />
// Solo per i test: il nome ha più punti, quindi `npx convex deploy` lo salta.

/**
 * Risposte ESPN vere, registrate una volta e alleggerite dei campi che non leggiamo.
 * Nessuna chiamata esce dalla macchina: i test servono questi file al posto di ESPN.
 */
const FIXTURES = import.meta.glob("./espnFixtures/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

/** Copia nuova di un fixture, così un test può modificarla senza toccare gli altri. */
export function loadFixture<T = any>(name: string): T {
  const data = FIXTURES[`./espnFixtures/${name}.json`];
  if (data === undefined) throw new Error(`Fixture ESPN mancante: ${name}`);
  return structuredClone(data) as T;
}

type Reply = { status: number; body?: unknown };

/**
 * `fetch` finto per ESPN. Per percorso risponde con il fixture che gli corrisponde;
 * `reply` sostituisce la risposta di un percorso. `calls` elenca i percorsi chiesti.
 */
export function espnFetchStub() {
  const replies = new Map<string, Reply>();
  const calls: string[] = [];

  const fixtureFor = (path: string, fixture: boolean): unknown => {
    const teams = path.match(/^\/site\/v2\/sports\/soccer\/([^/]+)\/teams$/);
    if (teams) return loadFixture(`teams-${teams[1]}`);
    const team = path.match(/^\/site\/v2\/sports\/soccer\/all\/teams\/(\d+)$/);
    if (team) return loadFixture(`team-${team[1]}`);
    const schedule = path.match(/^\/site\/v2\/sports\/soccer\/all\/teams\/(\d+)\/schedule$/);
    if (schedule) {
      const name = `schedule-${schedule[1]}-${fixture ? "fixtures" : "results"}`;
      return `./espnFixtures/${name}.json` in FIXTURES ? loadFixture(name) : undefined;
    }
    // Il tabellone del giorno, qualunque sia `?dates=`: i test fissano l'ora sul giorno registrato.
    const scoreboard = path.match(/^\/site\/v2\/sports\/soccer\/([^/]+)\/scoreboard$/);
    if (scoreboard) {
      const name = `scoreboard-${scoreboard[1]}-today`;
      return `./espnFixtures/${name}.json` in FIXTURES ? loadFixture(name) : undefined;
    }
    const standings = path.match(/^\/v2\/sports\/soccer\/([^/]+)\/standings$/);
    if (standings) {
      const name = `standings-${standings[1]}`;
      return `./espnFixtures/${name}.json` in FIXTURES ? loadFixture(name) : undefined;
    }
    return undefined;
  };

  const fetch = async (input: URL | string | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== "https://site.api.espn.com" || !url.pathname.startsWith("/apis/")) {
      throw new Error(`Chiamata inattesa nei test: ${url.href}`);
    }
    const path = url.pathname.slice("/apis".length) + url.search;
    calls.push(path);
    const reply = replies.get(path) ?? replies.get(url.pathname.slice("/apis".length));
    if (reply) return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), { status: reply.status });
    const summary = /\/summary$/.test(url.pathname) ? `summary-${url.searchParams.get("event")}` : null;
    const body = summary
      ? `./espnFixtures/${summary}.json` in FIXTURES
        ? loadFixture(summary)
        : undefined
      : fixtureFor(url.pathname.slice("/apis".length), url.searchParams.get("fixture") === "true");
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };

  return {
    fetch,
    calls,
    /** Risponde a `path` (senza `/apis`) con `body`, o con un errore se `status` non è 200. */
    reply(path: string, body: unknown, status = 200) {
      replies.set(path, { status, body });
    },
  };
}

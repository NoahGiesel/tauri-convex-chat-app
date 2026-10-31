# How does Playwright sign in through Better Auth?

Research for issue #5, on the map in issue #3.

## Answer

Sign each user in once with their real email and password, save Playwright storage state for the
`http://localhost:1420` origin, and give each user their own browser context.

- **Where the session lives:** in `localStorage`, under the key `better-auth_cookie`. The app sets no
  browser cookies for auth.
- **Reuse:** storage state captures `localStorage`, so the session can be reused. Regenerate it on
  every run and do not commit it.
- **Two users:** two contexts in one test. Two pages in one context share a single session.
- **Booting outside Tauri:** the app does not need a Tauri shell. The two files named in the ticket
  have no `isTauri()` check, but both already catch the failure and fall back.

## How to read the claims

Versions come from `pnpm-lock.yaml`, and the source was read from a frozen install:
`better-auth@1.6.33`, `@convex-dev/better-auth@0.12.6`, `convex@1.49.0`, `@tauri-apps/api@2.12.4`,
`@tauri-apps/plugin-opener@2.7.2`.

- **[Ran]**: observed by running it against a throwaway local anonymous Convex backend, with this
  repo's `convex/` code pushed to it. Tests used raw HTTP, or the real `createAuthClient` plus
  `crossDomainClient` in Node with a `Map` standing in for `localStorage`.
- **[Read]**: read in source or docs, and not run.

**No part of this was run in a real browser.** See [Not verified](#not-verified).

## Where the session lives

`src/lib/auth-client.ts` uses `crossDomainClient()`, and `convex/auth.ts` uses `crossDomain({ siteUrl })`.

| Step | Behaviour | Status |
|---|---|---|
| Client request | Sends `credentials: "omit"` and a `Better-Auth-Cookie` header built from storage | [Read] `plugins/cross-domain/client.ts` `init` |
| Server, before the endpoint | Copies `Better-Auth-Cookie` into the `cookie` header | [Read] `plugins/cross-domain/index.ts` before hook |
| Server, after the endpoint | Moves `Set-Cookie` to `Set-Better-Auth-Cookie` | [Ran] session token arrived this way |
| Client response | Writes it to `better-auth_cookie` | [Ran] |
| CORS | Reflects trusted origins, exposes `Set-Better-Auth-Cookie` | [Ran] response headers |

The stored value is JSON, keyed by cookie name [Ran]:

```json
{ "better-auth.session_token": { "value": "<token.signature>", "expires": "2026-11-07T20:07:21.880Z" } }
```

- **The name changes with the backend URL.** It was `better-auth.session_token` on the `http` local
  backend [Ran]. Better Auth adds `__Secure-` when `baseURL` starts with `https://`, so a cloud
  deployment should give `__Secure-better-auth.session_token` [Read] `cookies/index.mjs:21`. Never
  hard-code it.
- **The Convex JWT is short-lived and not needed in saved state.** A sign-up response stores only
  the session token. The JWT in that response stays a plain `Set-Cookie` that the client ignores
  [Ran]. `ConvexBetterAuthProvider` fetches a JWT from `/convex/token` using the session [Read]
  `react/index.tsx`, and a restored session with no JWT got one that way [Ran]. It lasts 900 seconds
  [Ran].
- **`better-auth_session_data`** caches the last `/get-session` response [Read]. The client still
  calls `/get-session` to read the session, so this key is not the source of truth.

## Reusing it through storage state

Playwright documents storage state as covering "cookies, local storage, IndexedDB" and recommends a
`setup` project that the test projects depend on. It says session storage cannot be persisted, and
that `playwright/.auth` belongs in `.gitignore` ([docs](https://playwright.dev/docs/auth)). `src/` does
not use `sessionStorage` or IndexedDB, so the default `storageState()` is enough [Read].

What a saved session does when restored [Ran, with the `Map` standing in for `localStorage`]:

| Scenario | Result |
|---|---|
| Restore saved storage into a new client | `getSession` returns the user |
| Same restored storage, JWT never saved | `convex.token` returns a JWT for that user |
| Stored `expires` set to the past | Client sends nothing and is signed out, though the server session is live |
| One holder of a shared session signs out | Every other holder of that saved state is signed out |
| Same user signs in twice, one signs out | The other session survives |

Session lifetime is 7 days with a 1-day refresh age, because `convex/auth.ts` sets neither [Read]
`context/create-context.mjs:146-147`; the 7-day `Max-Age` itself was observed [Ran]. A session saved
now outlives any local run, but it is tied to the backend that issued it, so resetting that backend
should invalidate it [Read: inferred from the session being a database row].

## Two users in one test

Playwright documents this exact case: use "multiple BrowserContexts and Pages with different storage
states in the same test" ([auth](https://playwright.dev/docs/auth)), and contexts are "completely
isolated" with their own local storage, useful for "multi-user functionality, like a chat"
([contexts](https://playwright.dev/docs/browser-contexts)).

- Two separate storages held two users concurrently, each resolving to the right account [Ran].
- Two pages in one context share `localStorage`, so they are one user. Better Auth also syncs tabs
  through `storage` events on `better-auth.message` [Read] `client/broadcast-channel.mjs`.
- The popout from `openChatWindow` uses `window.open` outside Tauri [Read] `src/lib/popout.ts`. It
  should open as a page in the same context, signed in as the same user [Read: not run].

## Does the app boot outside Tauri?

Yes, by reading the code [Read]. Every `@tauri-apps` use in `src/`:

| File | Protection outside Tauri |
|---|---|
| `src/lib/links.ts` | `try`/`catch` around `openUrl`, falling back to `window.open` |
| `src/components/settings-updates.tsx` | `getVersion().catch(...)` shows `dev` |
| `src/hooks/use-updater.tsx` | Local `isTauri()` check before `check()` and the timers |
| `src/hooks/use-message-notifications.ts` | Local `isTauri()` check on all Tauri calls |
| `src/lib/popout.ts` | `isTauri()` from `@tauri-apps/api/core` |

The ticket is right that `links.ts` and `settings-updates.tsx` have no `isTauri()` check, but it does
not matter. Both reach `invoke`, which is declared `async function invoke` and reads
`window.__TAURI_INTERNALS__.invoke` [Read] `@tauri-apps/api/core.js:340`. Outside Tauri that
`TypeError` becomes a rejected promise, which both call sites handle.

The static imports are safe in the modules checked: `window.js` and `webviewWindow.js` run only enum
and class definitions at load [Read]. `core.js`, `event.js`, `webview.js` and the plugin bundles were
not audited line by line.

`src/main.tsx` needs only `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`.

## Sign-in options

Sign-up needs no verification, and it signs the user in [Ran], because `convex/auth.ts` sets
`requireEmailVerification: false`.

| Option | For | Against |
|---|---|---|
| **A. UI sign-in in a `setup` project** | No coupling to the stored format, exercises the real form, first load creates the profile | Slower per account |
| **B. HTTP sign-in, then build the state by hand** | Fast, about 150 ms per sign-in on the local backend [Ran] | Depends on the private `better-auth_cookie` JSON format |
| **C. Sign in through the UI in every test** | Nothing saved | Slowest, and repeats what one test can cover |

**Recommendation: A**, with one dedicated test for the auth screen itself. Move to B only if setup
time becomes a problem. Tests that sign out or delete the user need their own session, so they must
not share saved state. Playwright's own advice for tests that change server state is one account per
parallel worker ([docs](https://playwright.dev/docs/auth)). Which accounts exist is for #7 and #10.

If B is used, a request must send `Origin: http://localhost:1420` and `Better-Auth-Cookie` (an empty
value is fine), and read `Set-Better-Auth-Cookie` [Ran].

## Traps

1. **`baseURL` must be exactly `http://localhost:1420`.** `http://127.0.0.1:1420` and
   `http://localhost:1421` both get 403 `INVALID_ORIGIN` [Ran]. Storage state is also per origin
   [Read]. `vite.config.ts` sets `strictPort: true`, so the port will not drift [Read].
2. **The `Better-Auth-Cookie` header is what makes this work.** Without it, the session token comes
   back as a plain `Set-Cookie` and `Set-Better-Auth-Cookie` is absent [Ran].
3. **Node `fetch` needs an explicit `Origin`.** With no `Origin`, Node's `fetch` got 403
   `MISSING_OR_NULL_ORIGIN`. A raw `node:http` request with no `Origin` succeeded, and adding
   `Sec-Fetch-Mode: cors` to it reproduced the 403 [Ran]. This matches `validateFormCsrf` [Read].
   The behaviour of Playwright's `request` API was not tested.
4. **An account has no app profile until the app opens.** `users.me` is `null` after sign-up, and
   `ensureProfile` creates the row [Ran]. `src/App.tsx` calls it on first load [Read]. A Seed that
   creates users through the auth API must also create profiles, or friend flows will not find them.
   This matters for #7.
5. **Do not assert sign-out by checking the key is gone.** The keys stay, with empty values [Ran].
6. **The rate limiter was off locally, and that may not hold on cloud.** Ten sequential sign-ins and
   six concurrent sign-ups all returned 200 [Ran]. Better Auth enables it only when `NODE_ENV` is
   `production` [Read] `create-context.mjs:171`, and the backend also accepted the default secret,
   which throws in production [Ran, Read]. If it were on, sign-in would allow 3 requests per 10 seconds, and with
   no client IP all workers would share one bucket [Read] `api/rate-limiter/index.mjs`. If #6 picks a
   cloud deployment, run one burst there first.
7. **`pnpm dev` can refuse to start.** In a fresh worktree it stopped with
   `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, because `tslib@2.9.1` was under 24 hours old. Its
   integrity hash matches the registry, so this was only the age rule [Ran]. The cause of the
   pre-run install was not investigated, so a Playwright `webServer` using `pnpm dev` might hit this
   after a dependency update.
8. **Language comes from `localStorage` (`chat:lang`), defaulting to English** [Read]
   `src/i18n/i18n-provider.tsx`. Playwright's `locale` option will not change it, and saved state
   carries that preference along with theme and sidebar settings. This matters for the selectors
   question on the map.

## Not verified

- **Anything in a real browser.** That covers the app booting at `:1420`, the sign-in form, a real
  `storageState()` round trip, and the Convex WebSocket authenticating each context. The app was
  never loaded, because `pnpm dev` was blocked (trap 7) and the policy was not bypassed. The evidence
  is strong but indirect: the real client code restored from a simulated store, plus the Playwright
  docs.
- **Message delivery between two users.** Issue #9 covers this.
- **A cloud deployment.** Nothing here touched one. The `__Secure-` cookie name and the rate limiter
  state are unconfirmed on cloud.
- **Open pages after revocation.** How long a page with a revoked session stays usable before a
  reload is unknown. Its JWT lasts up to 15 minutes [Ran], so it may be a while.
- **Session refresh after 1 day.** Read only.

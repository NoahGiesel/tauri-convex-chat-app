# Can the local Convex backend run this app?

Research for the ticket "Can the local Convex backend run this app?" on the map "Reduce manual QA
with seeded E2E tests". Throwaway branch, never merged. Researched on 2026-10-31.

## Answer

**Yes.** The local backend runs this app, including the Better Auth component, the `/api/auth/*`
HTTP routes, JWT validation and realtime. Two users signed in through the real UI on
`http://localhost:1420` and exchanged a message over WebSocket, on Windows 11.

Three conditions apply:

1. **`npx convex dev --local` no longer exists.** On this version it exits 1. Use an anonymous local
   deployment instead.
2. **`convex dev` must not run in a developer's checkout.** Every variant rewrites `.env.local`, and
   with a real `CONVEX_DEPLOYMENT` there it targets the cloud even in anonymous mode. Run it from a
   disposable stage directory.
3. **A Seed snapshot is tied to the secret and the site port.** Change either and it breaks: one way
   with a 500, the other silently.

macOS is **not verified**: nothing here ran on a Mac.

## How to read this

Every claim carries one of three labels:

- **[ran]**: executed on this machine and observed.
- **[read]**: read in source or docs, not executed.
- **[inferred]**: follows from what was run or read, but was not itself observed.

| Tested with | Version |
|---|---|
| `convex` (`pnpm-lock.yaml`) | 1.49.0 |
| `@convex-dev/better-auth` | 0.12.6 |
| `better-auth` | 1.6.33 |
| Backend binary | `precompiled-2026-10-22-1447815` (the current `latest` on that date) |
| Machine | Windows 11 x64, Node 24.1.0, headless Chrome via `playwright-core` 1.64.1 |

Experiments ran in a throwaway export of `HEAD` outside the repo, with no real `.env` files. Tests of
`.env.local` handling used a sentinel file with fake values and a fake home directory, so the CLI had
no real login. No cloud deployment was changed. Source paths below are under
`node_modules/convex/src/cli/lib/` unless stated.

Timings come from one machine with a very small Seed (5 to 16 documents), so treat them as orders of
magnitude. Sample counts are given.

## What ran end to end

**[ran]** The flow in [Recommended flow](#recommended-flow), three times out of three:

- Sign-up through the real UI, with the browser's token mint returning 200.
- Friendship created through the app's own `users:search`, `friends:request` and `friends:accept`.
- The friend appeared in the sidebar with no reload (30 to 38 ms).
- A message typed in A's UI appeared in B's UI (36 to 41 ms) over `ws://127.0.0.1:3310/api/1.49.0/sync`.
- The session survived a reload. It is held in `localStorage`, as `src/lib/auth-client.ts` intends.
- A Seeded user signed in through the UI and their imported profile rendered.

**[ran]** Auth is really validated rather than ignored. With no token, `users:ensureProfile` throws
`not_authenticated`. With a valid token it creates the profile. With a tampered signature the backend
answers 401. So the plain-`http` issuer and JWKS URL that `getAuthConfigProvider`
(`@convex-dev/better-auth/src/auth-config.ts`) builds from `CONVEX_SITE_URL` are accepted, even though
the JWKS URL is the backend's own `http://127.0.0.1:3311`.

**[ran]** Routes and CORS: `/api/auth/ok` returns 200, the preflight allows
`http://localhost:1420` with `Better-Auth-Cookie`, and a sign-up from `http://evil.example` gets 403
`INVALID_ORIGIN`. `authComponent.registerRoutes` in `convex/http.ts` needed no change.

Not exercised: groups, media, settings, and anything that touches R2.

## Traps

These are the findings a spec must carry. Each one failed for real during this research, except where
marked.

### `convex dev` overwrites `.env.local`

**[ran]** With a sentinel `.env.local`, rewritten before each case so identical writes could not hide:

| How `convex dev --once` was targeted | Result | `.env.local` |
|---|---|---|
| `CONVEX_AGENT_MODE=anonymous` alone | Ignored. Goes for the cloud deployment and asks to log in | Intact |
| `CONVEX_DEPLOYMENT=anonymous:anonymous-agent` in the process env | Local | **Rewritten** |
| `CONVEX_DEPLOYMENT=` (empty) in the process env | Local | **Rewritten** |
| `--env-file` with `CONVEX_SELF_HOSTED_*` | Local | **Rewritten** |
| `--url` and `--admin-key` | Local | **Rewritten** |
| `CONVEX_SELF_HOSTED_*` in the process env | Exit 1: "`CONVEX_DEPLOYMENT` must not be set" | Intact |

"Rewritten" means `CONVEX_DEPLOYMENT` is removed or replaced and both `VITE_CONVEX_*` lines are
overwritten. The developer's next `pnpm tauri dev` would then point at a dead local URL **[inferred]**.
`convex env set` and `convex run` with `--env-file` left the file intact **[ran]**.

**[inferred]** In the first row, a logged-in developer would push to their real cloud dev deployment.
That run only stopped at the login prompt because the home directory was fake. It follows from the
order in `getDeploymentSelection` in `deploymentSelection.ts`: env-derived selection returns before the
`CONVEX_AGENT_MODE` check **[read]**. The docs agree: anonymous is the default only "when no deployment
is already configured" ([Agent Mode](https://docs.convex.dev/cli/agent-mode)).

The write comes from `finalizeConfiguration` in `init.ts`, which calls `writeUrlsToEnvFile` **[read]**.
The path is relative to the working directory (`ENV_VAR_FILE_PATH` in `utils/utils.ts`) **[read]**,
which is why a separate working directory solves it.

`npx convex deploy` might avoid the write. It was **not tried**: it is out of bounds for this work,
and a suite that calls `deploy` is one missed env file away from production.

### Setting the secret after the first sign-in breaks all auth

**[ran]** Better Auth generates a JWKS on first use, with its private key encrypted by the current
secret. Changing `BETTER_AUTH_SECRET` afterwards makes every `/api/auth/convex/token` call
return 500 with "Failed to decrypt private key". Sign-in still returns 200, and the UI leaves the
sign-up form, so a test that only checks the form disappeared passes on a broken app. Assert on the
token response or on chat UI instead.

**[ran]** With no secret set, auth appears to work: Better Auth falls back to the public default
`better-auth-secret-12345678901234567890`, and only rejects it when `NODE_ENV` is `production`
(`better-auth/dist/context/create-context.mjs`, **[read]**). So set the secret, and set it **before**
any auth call.

### A Seed snapshot is tied to the secret

**[ran]** A snapshot includes `_components/betterAuth`, including that JWKS. Imported into a deployment
with a different secret, sign-in returns 200 and the token mint returns 500. With the same secret it
works. Use one fixed, test-only secret.

### A Seed snapshot is tied to the site port, silently

**[ran]** `tokenIdentifier` embeds the issuer, for example `http://127.0.0.1:3311|<subject>`, and the
issuer comes from `CONVEX_SITE_URL`. Importing a snapshot taken on port 3311 into a backend on 3321:

- `users:me` returns `null` for the Seeded user, with no error.
- `users:ensureProfile` creates a **second profile** for the same email.

`src/App.tsx:28` calls `ensureProfile` whenever `me === null`, so the real app would do this on its own
**[read]**, and the user would lose their Seeded friendships and conversations with nothing to see in
the logs **[inferred]**. Keep the ports fixed. Seeds built at runtime through sign-up do not have this
coupling **[inferred]**, which the Seed ticket should weigh.

### Smaller traps

- **`convex dev --once` stops the backend on exit [ran].** Port 3310 is closed afterwards. Keep
  `convex dev` running for the suite, as the
  [docs](https://docs.convex.dev/cli/local-deployments) state.
- **The backend binds `0.0.0.0` when started by the CLI [ran]**, so it is reachable from the LAN unless
  a firewall stops it. Started directly with `--interface 127.0.0.1`, it listens on loopback only
  **[ran]**.
- **Vite listens on `::1` only here [ran].** Use `http://localhost:1420`. `127.0.0.1:1420` is not
  listening, and it is not in the trusted origins in `convex/auth.ts` either.
- **The backend version floats [read].** Unpinned, the CLI asks `version.convex.dev` for `latest`, so
  it can change between runs. That API served a build nine days older than GitHub's newest **[ran]**,
  so the two are not the same thing. Pin it with `--local-backend-version`, which ran
  fine **[ran]**. That flag, `--local-cloud-port` and `--local-site-port` are hidden from `--help`
  (`dev.ts`), so they could change without notice **[read]**.
- **Default ports may be taken [ran].** Another agent's backend held 3210 during this work. Two
  deployments ran side by side, each from its own directory, with no conflict.

## Windows and macOS requirements

| Need | Windows | macOS |
|---|---|---|
| Native backend binary | x64 only. `getDownloadPath` in `download.ts` picks x64 regardless of arch **[read]**; ran on x64 **[ran]** | arm64 and x64 builds in the release **[read]** |
| Runtime libraries | Visual C++ Redistributable, or the backend exits with 3221225781 (`run.ts`) **[read]** | None documented |
| Node | 22 or newer: 1.49.0 dropped Node 20 (`CHANGELOG.md`) **[read]**. Ran on 24.1.0 **[ran]** | Same **[read]** |
| Internet on first run | Yes, for a 50 MB zip of a 129 MB binary from GitHub **[ran]** | Same size class **[read]** |
| Convex account | Not needed **[ran]** | Not needed **[read]** |
| Docker, Rust | Not needed **[ran]** | Not needed **[read]** |

- **Node actions:** the Node-version limitation in the docs does not apply, because no file in
  `convex/` uses `"use node"` **[read]**.
- **Windows caution:** the backend README says it "has less experience" on Windows
  ([README](https://github.com/get-convex/convex-backend#disclaimers)). Nothing here failed because of
  Windows, but that is one machine on one day.
- **Stopping it on Windows:** a hard kill of the CLI took the backend down with it in every stop during
  this work **[ran]**. Why it does is unknown, so a harness should still confirm the port is closed.
- **Beta status:** local deployments and data import are both labelled beta in the docs, and
  anonymous agent mode prints "mode is in beta" **[ran]**. Beta APIs may change on upgrade
  ([docs](https://docs.convex.dev/production/state#beta-features)).

## Environment variables

**On the backend**, set with `npx convex env set NAME value`, run from the stage directory:

| Name | Needed | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes in practice | Fixed and test-only. Set before any auth. See Traps |
| `SITE_URL` | No | `convex/auth.ts` defaults to `http://localhost:1420` |
| `CONVEX_SITE_URL` | Automatic | `http://127.0.0.1:<site port>` **[ran]** |
| `R2_*` | Phase two only | See below |

- **[ran]** Values survive a restart, a file-level restore and `import --replace-all`, so they live with
  the deployment rather than with table data. A new deployment starts without them **[inferred]**.
- **[ran]** `env set` takes about 0.5 s per call.
- **[read]** The linked flow, `npx convex deployment select local`, needs a login, registers with the
  cloud, and copies the project's default env vars on first creation
  (`importDefaultEnvVars` in `localDeployment.ts`). That is a reason to prefer anonymous here. It was
  not run.

**In Vite**, `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` set in the process environment beat
`.env.local`. **[ran]**: with the sentinel on disk, the served `main.tsx` and `auth-client.ts` held the
local URLs and no sentinel value. This matches the
[Vite docs](https://vite.dev/guide/env-and-mode): variables that already exist "have the highest
priority". `VITE_GIPHY_API_KEY` is optional.

**External services, for phase two [read]:**

- `signedReadUrl` in `convex/r2.ts` throws `media_not_configured` without `R2_*`, and `messages:list`
  calls it for every attachment (`convex/messages.ts:119`). One Seeded attachment without R2 config
  would fail that whole query for the conversation **[inferred]**.
- `convex/previews.ts` fetches real public URLs for link previews.
- Text-only messaging does not reach either of these **[ran]**.

## Resetting data between runs

All of these were checked the same way: added data must be gone, **and** a Seeded user must still sign
in, mint a token and resolve their profile.

| Method | Time | Runs | Keeps env vars | Notes |
|---|---|---|---|---|
| `convex import --replace-all --yes seed.zip`, backend running | 1.0 to 1.2 s | 3 | Yes | Includes component tables. Best between tests |
| Stop, restore a copy of the state directory, start | 2.7 s | 2 | Yes | Needs a restart |
| Delete state, start, set env, import | 4.6 s | 4 | Set again | Best at the start of a run |

All **[ran]**. `convex export` produced the snapshot in 0.6 s. Deleting the state directory alone takes
under 30 ms; it holds a SQLite file and a storage directory in `.convex/local/default/`.

- **[ran]** Component data is visible with `convex data --component betterAuth`.
- **[ran]** `convex run` reaches internal functions, about 0.5 s per call, so a Seed can be an internal
  function with no public surface added.
- **[read]** Import is atomic: "Queries and mutations will not view intermediate states"
  ([Data Import](https://docs.convex.dev/database/import-export/import)). The same page warns against
  editing the ZIP, so regenerate a Seed rather than hand-editing it.
- **[ran]** A snapshot contains password hashes and the encrypted JWKS. That is harmless for fake users
  and a test-only secret, but it must never come from a real deployment.

## Local against a separate cloud dev deployment

The cloud column is **read, not measured**. Measuring it needs a new cloud deployment, which was out of
bounds.

| | Local, anonymous | Separate cloud dev deployment |
|---|---|---|
| First start | 5.6 s to functions pushed, including download, 1 run **[ran]** | Not measured |
| Later start to testable | 4.6 s with Seed, 4 runs **[ran]** | Not measured. Docs say only that local code sync "is faster" |
| Reset | About 1.1 s **[ran]** | `import` works the same way **[read]**; time not measured |
| Message delivery | About 36 ms, loopback **[ran]** | Not measured; adds network distance **[inferred]** |
| Cost | Calls and bandwidth "don't count against" plan quotas ([docs](https://docs.convex.dev/cli/local-deployments)) **[read]** | Counts toward the plan: 1M function calls a month on Free, 40 deployments per team, and imports use database bandwidth ([limits](https://docs.convex.dev/production/state/limits)) **[read]** |
| Account and network | Neither after first run, if the version is pinned **[read]**, not tested offline | Login, network and a team seat, always **[read]** |
| Isolation | Per directory, per machine. Parallel runs do not collide **[ran]** | Per deployment. One shared deployment means developers collide **[inferred]** |
| Production risk | No cloud credentials involved when run as below **[ran]** | Uses real credentials, so a mistake reaches a real deployment **[inferred]** |
| Secrets | Fake, local only **[ran]** | A secret on each cloud deployment, by hand or as a project default **[read]** |
| Seed portability | One snapshot for everyone, given fixed ports and secret **[ran]** | Issuer embeds the deployment URL, so per-developer deployments cannot share one snapshot **[inferred]** |
| `.env.local` overwrite | Same risk, same fix | Same risk: same code path **[inferred]** |
| Fidelity | Runs "the same fully up-to-date code the cloud service uses" ([docs](https://docs.convex.dev/self-hosting)) **[read]** | The real platform |

**Cloud wins** only for things this suite does not need: public webhooks, and integrations that do not
run locally ([Agent Mode](https://docs.convex.dev/cli/agent-mode)). The repo has no webhooks or
`crons.ts` **[read]**. For a local-only suite, the local backend is the better fit.

## Recommended flow

This is the exact shape that passed, as an input to the spec rather than an implementation:

1. **Build a stage directory** in a git-ignored path. Copy `convex/` and `package.json`, and link
   `node_modules`. A Windows junction worked **[ran]**; a macOS symlink is untested.
2. **From the stage directory**, keep this running:
   ```bash
   CONVEX_AGENT_MODE=anonymous npx convex dev \
     --local-cloud-port 3310 --local-site-port 3311 \
     --local-backend-version <pinned> --typecheck disable --tail-logs disable
   ```
3. **Set env, before any auth:** `npx convex env set BETTER_AUTH_SECRET <fixed test-only value>`.
4. **Load the Seed:** `npx convex import --replace-all --yes <seed>.zip`.
5. **From the real checkout**, start Vite with the local URLs in the process environment:
   ```bash
   VITE_CONVEX_URL=http://127.0.0.1:3310 VITE_CONVEX_SITE_URL=http://127.0.0.1:3311 vite
   ```
6. **Point tests at `http://localhost:1420`.** Between tests, repeat step 4.

Result **[ran]**: testable in 4.6 s, the sentinel `.env.local` byte-identical, and no `.convex` or
regenerated files in the checkout. `convex dev` reproduced `convex/_generated` exactly apart from line
endings **[ran]**, and in this flow it writes only to the stage directory anyway.

A guard worth adding, given the map's rule against touching production: refuse to run unless both
`VITE_*` URLs start with `http://127.0.0.1:`.

**Variant:** the backend binary run directly, with `--interface 127.0.0.1 --disable-beacon`, reached
testable in 3.9 s (3 runs) **[ran]** and gives loopback-only binding. It still needs the stage directory
for the push, and it depends on finding the binary yourself, so it costs more code. It is worth it only
if the `0.0.0.0` binding or the
[beacon](https://github.com/get-convex/convex-backend#disclaimers) matters to the team.

## Not verified

- **macOS.** Nothing ran on a Mac: not the binary, the symlink, nor any timing. Only the release assets
  and source were read. This is the biggest gap, since the suite must work there.
- **The cloud side of the comparison.** No cloud start-up, reset or latency figures exist.
- **A real logged-in push** in the `.env.local` trap. Observed only up to the login prompt.
- **`npx convex deployment select local`.** Read only.
- **Offline starts** with a pinned version. Read only.
- **Browsers other than Chrome.** The docs say Safari blocks localhost for the *dashboard*. Whether that
  touches this app under WebKit is unknown.
- **Windows Firewall.** No prompt appeared in this session, but a first run elsewhere may differ.
- **Windows without the Visual C++ Redistributable, and Windows on ARM.**
- **Scale and durability.** Large Seeds, long runs, and whether an old snapshot imports cleanly after a
  schema change or a backend upgrade.
- **The console 404** on first page load. `/favicon.ico` returns 404, which is the likely cause, but
  the error was not tied to that request.

## Sources

- Repo at `d1b277f`: `convex/auth.ts`, `auth.config.ts`, `http.ts`, `convex.config.ts`, `r2.ts`,
  `messages.ts`, `previews.ts`, `users.ts`, `model.ts`, `src/App.tsx`, `src/lib/auth-client.ts`,
  `vite.config.ts`, `docs/DEPLOY.md`, `pnpm-lock.yaml`.
- `convex` 1.49.0 source: `src/cli/dev.ts`, and in `src/cli/lib/`: `deploymentSelection.ts`, `init.ts`,
  `envvars.ts`, `utils/utils.ts`, `localDeployment/{localDeployment,anonymous,run,download,filePaths,utils,secrets}.ts`;
  `CHANGELOG.md` entries 1.32 to 1.49 (`--local` removed in 1.40.0).
- `@convex-dev/better-auth` 0.12.6: `src/auth-config.ts`, `src/plugins/cross-domain/index.ts`.
- `better-auth` 1.6.33: `dist/context/create-context.mjs`.
- Convex docs: [Local Deployments](https://docs.convex.dev/cli/local-deployments),
  [Agent Mode](https://docs.convex.dev/cli/agent-mode),
  [Multiple Deployments](https://docs.convex.dev/production/multiple-deployments),
  [Data Import](https://docs.convex.dev/database/import-export/import),
  [Limits](https://docs.convex.dev/production/state/limits),
  [Self Hosting](https://docs.convex.dev/self-hosting),
  [Testing against a local backend](https://docs.convex.dev/testing/convex-backend),
  [Pricing](https://convex.dev/pricing).
- [`get-convex/convex-backend`](https://github.com/get-convex/convex-backend): README and the release
  assets of `precompiled-2026-10-31-f8e8c14`.
- [Vite: Env Variables and Modes](https://vite.dev/guide/env-and-mode).

# Can WebdriverIO drive two isolated Tauri app instances?

Research for issue #11, on the map in issue #3. Throwaway branch, never merged. Researched on
2026-10-31.

## Answer

**Yes on Windows, proven by running. On macOS it is plausible but needs an app change, and nothing
ran there [read, not run].**

`@wdio/tauri-service` multiremote drove two instances of the real Tauri app, each with its own user.
Sign-up, a friendship and messages in both directions all went through the real UI, against a local
Convex backend. That passed 4 runs out of 4, at about 9.6 s per run.

**What keeps two instances apart is the WebView2 user data folder, and nothing else.** One folder
means one browser process and one shared `localStorage`, so the second instance becomes the first
user. Two folders mean two browser processes and two sessions.

**The service does not do this for you.** With the embedded driver it sets no data directory, and
without one the second instance inherited the first user's token. On Windows the fix needs no app
code: set `WEBVIEW2_USER_DATA_FOLDER` per capability, through `wdio:tauriServiceOptions.env`.

macOS has no such variable [read, not run]. There the app has to pass `dataStoreIdentifier` when it
creates each window, which needs macOS 14 or newer [read, not run].

## How to read this

Every claim carries one of these labels:

- **[ran]**: executed on this machine and observed.
- **[read]**: read in source or docs, not executed.
- **[inferred]**: follows from what was run or read, but was not itself observed.
- **[read, not run]**: any claim about macOS. No Mac was available, so nothing here ran on one.

| Tested with | Version |
|---|---|
| `tauri` / `tauri-build` (`Cargo.lock`) | 2.12.5 / 2.7.4 |
| `wry` / `tao` / `webview2-com` | 0.57.1 / 0.37.2 / 0.39.1 |
| `@tauri-apps/api` / `@tauri-apps/cli` | 2.12.4 / 2.12.4 |
| `@wdio/tauri-service`, `tauri-plugin-wdio-webdriver` | 1.5.1, 1.5.1 |
| `webdriverio`, `@wdio/cli` | 9.32.0 (see the trap on version 10) |
| `playwright-core` | 1.64.1 |
| `convex`, `better-auth`, backend binary | 1.49.0, 1.6.33, `precompiled-2026-10-22-1447815` |
| WebView2 Runtime | 156.0.4314.50 |
| Machine | Windows 11 x64, 20 threads, Node 24.1.0, pnpm 11.11.0, Rust 1.99.1 |

Tested at `d1b277f`. `origin/master` has since gained two UI and presence commits that touch no
Tauri, Cargo, auth or storage code, so they should not change this [inferred]. The `@wdio` source was
read at tag `wdio-tauri-service@v1.5.1`, because the published docs disagree with it in places.

Timings come from one machine with almost no data. Treat them as orders of magnitude. Sample counts
are given, and a figure with no count is a single sample.

### The binary was not a normal build

This machine has no Rust, MSVC or Windows SDK, so the app could not be built the usual way. The result
was a real Tauri binary, but not the one a release produces. **Isolation lives in WebView2, which
none of the differences below touch [inferred], but timings and sizes may not carry over.**

| Difference from a normal build | Why |
|---|---|
| Target `x86_64-pc-windows-gnu`, linked with `rust-lld` | No MSVC. A machine-wide Build Tools install and `cargo-xwin` (which accepts Microsoft's licence) were both ruled out as not mine to do unasked |
| `tauri-plugin-updater` removed | It pulls in `ring`, which needs a C compiler. A portable MinGW was blocked by this session's permission policy, and not worked around |
| Small local stand-ins for `windres` and `dlltool` | Written for this work and compiled from local source. So no embedded icon or manifest; the manifest sat beside the `.exe` |
| Library built as `rlib` only | The `cdylib` exceeds the 65,535 export limit on this target, and the desktop `.exe` does not use it |
| Identifier `dev.research.wdio-instances` | To stay away from the real profile. See [Traps](#traps) |

Rust was installed into a git-ignored folder in the worktree with `--no-modify-path`. Nothing was
installed machine-wide. The user `PATH`, environment variables and rustup's uninstall registry key were
checked afterwards and are unchanged. One stray `cargo` call left an empty `%USERPROFILE%\.rustup`,
which was removed.

Other throwaway changes, none committed: the main window was created in `setup` so an env var could
set `data_directory`; `create: false`; `beforeDevCommand` called Vite directly; updater config removed.

## What ran end to end

**[ran]** Through `@wdio/tauri-service` multiremote with the embedded provider, in two real app
processes at origin `http://tauri.localhost`, against a local anonymous Convex backend:

| Step | Result |
|---|---|
| Both instances have `window.__TAURI_INTERNALS__` | Yes, so this is the real app, not a browser |
| Alice signs up; Bob's instance reloads | Bob has no session token and stays on the auth screen |
| Bob signs up | Tokens differ, and each UI shows only its own name |
| Friend request and accept through the UI | Each appears in the other's sidebar |
| Messages both ways | Delivered in 35 to 47 ms, 8 samples |
| Reload both | Both stay signed in as themselves |

- 4 full passes out of 4. Each took about 9.6 s including WDIO start-up, and about 4.7 s of tests.
- Each instance gets its own port, `embeddedPort + index` **[read]** `launcher.ts:390`.
- `document.hasFocus()` varied between runs, including both windows unfocused, and it made no
  difference. A harness does not need to manage focus.

**[ran]** Negative control: the same config without the per-capability `env` failed on the first
isolation assertion, because Bob's instance held a session token before he had signed up.

The config shape that passed:

```js
const cap = (name) => ({
  capabilities: {
    browserName: 'tauri',
    'tauri:options': { application: EXE },
    'wdio:tauriServiceOptions': { env: { WEBVIEW2_USER_DATA_FOLDER: profileDir(name) } },
  },
});

export const config = {
  services: [['@wdio/tauri-service', { driverProvider: 'embedded', embeddedPort: 4540 }]],
  capabilities: { alice: cap('alice'), bob: cap('bob') },
  // ...
};
```

Instances are reached with `browser.getInstance('alice')`.

Not exercised: groups, media, settings.

## What keeps two instances apart

**[ran]** The same procedure in each row: instance 1 signs up, instance 2 reloads, and the real
`--user-data-dir` is read from the running WebView2 process. One sample per row.

| Configuration, per instance | Browser processes | `--user-data-dir` | Sessions |
|---|---|---|---|
| Nothing set | **1** | `%LOCALAPPDATA%\<identifier>\EBWebView` | **Shared** |
| `TAURI_DATA_DIR` | **1** | Same default | **Shared**: the variable did nothing |
| `WEBVIEW2_USER_DATA_FOLDER` | 2 | `<folder>\EBWebView`, one each | **Separate** |
| Tauri `data_directory` in Rust | 2 | `<folder>\EBWebView`, one each | **Separate** |
| Both of the last two | 2 | The env var's folder | **Separate**: the env var wins |

In the separate rows each UI showed only its own user, and both stayed signed in after a reload.

Why, in order:

1. Tauri forces a data directory on Windows, using `app_local_data_dir()` unless one is specified
   [read] `tauri/src/manager/webview.rs:559`. That path comes from the identifier, so every process of
   one app gets the same folder.
2. Each user data folder has one WebView2 session, and "If you launch two copies of your host app,
   they will use the same UDF" ([Microsoft](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder))
   [read]. `LocalStorage` is stored in it [read].
3. WebView2 replaces the `userDataFolder` argument with `WEBVIEW2_USER_DATA_FOLDER` when it is set
   ([reference](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/webview2-idl))
   [read], which is why the env var beats Tauri's setting [ran].

Note: with a shared folder, instance 2 already held the token before any reload, but still showed the
auth screen until it reloaded [ran]. A test that only looks at the screen could miss that it is shared.

## Traps

These are the findings a spec must carry. Each one failed for real here, except where marked.

### A test binary can reach a developer's real session

**[ran]** `%LOCALAPPDATA%\dev.NoahGiesel.chat` exists on this machine. The default folder comes from
the identifier, and a built binary uses the origin `http://tauri.localhost` on Windows. So a test
binary with the real identifier and no override would open the installed app's profile, at the same
origin, and could read or overwrite the real session **[inferred]**. This was deliberately not run:
the build used another identifier, and the newest file in the real folder had the same timestamp
before and after all this work **[ran]**.

The harness must always set a profile explicitly, and refuse to start without one.

### The service does not isolate embedded instances

**[read]** `startEmbeddedDriver` in `embeddedProvider.ts` sets only `TAURI_WEBDRIVER_PORT` and
`WDIO_EMBEDDED_SERVER`. `generateDataDirectory` in `launcher.ts` is used only by the `tauri-driver`
paths. **[ran]** The negative control above confirms it.

### `TAURI_DATA_DIR` does nothing

The service sets this per instance for `external` and `crabnebula` multiremote on Windows **[read]**,
and on macOS **[read, not run]**, at `launcher.ts:450,491,526`. On this Tauri version it had no effect on Windows **[ran]**, and
a GitHub code search of the `tauri-apps` org finds no use of it **[read]**. So those routes should not
isolate either, though neither was run with a driver **[inferred]**. The env object at `launcher.ts:527`
also leaves out per-capability `env` **[read]**.

### Setting `data_directory` on the main window breaks popouts

**[ran]** A `chat-*` window opened with the same IPC call as `openChatWindow`:

| Isolation method | Popout's profile | Popout has the session |
|---|---|---|
| `WEBVIEW2_USER_DATA_FOLDER` | The instance's own folder | **Yes** |
| Tauri `data_directory` on `main` only | **The default folder**, in a second browser process | **No: signed out** |

`src/lib/popout.ts` creates the window from JS with no data directory, so with the second method it
falls back to the default. The call was made directly because tab drag-out was not automated.

### A stale app on the port is driven silently

**[ran]** The docs say "the port must be free, or the service fails". That is not what happens. With a
signed-in app already holding port 4540, a WDIO run **passed with no error** while `alice` drove the
old app, signed in as the old user. The new app kept running with nothing logged.

The service only polls `/status` **[read]**, and the plugin logs a failed bind through `tracing` and
carries on **[read]** `server/mod.rs:73-81`. With the raw client, `/status` answered in 4 ms from the
old app **[ran]**. The harness must check that its ports are free before starting.

### Spec files share the app, its session and its JS state

**[ran]** The launcher starts apps once, in `onPrepare`. A `window.__marker` set in one spec file was
still there in the next, and both users were still signed in (3 runs of 2 spec files). So nothing is
reset between files. Any reset is the harness's job.

A launcher comment warns that "the embedded Tauri process can crash after a WebDriver session is
deleted" on Windows **[read]**. No crash happened in those 3 runs **[ran]**. The health check that
recovers from it comes after an early return that fires in multiremote: the warning "Tauri application
path not found in capabilities" printed for every worker **[ran]**. So recovery probably does not run
under multiremote **[inferred]**. No crash was injected to prove it.

### The documented release gate does not gate the dependency

See [What the embedded server adds](#what-the-embedded-server-adds).

### Smaller traps

- **`wdio.conf` is evaluated in the launcher and again in each worker [ran].** A cleanup in the config
  ran while the apps were live and failed with `EPERM` on the open profile. Clean up before WDIO starts.
- **An exited app does not mean a quiet profile [ran].** The WebView2 browser process outlived the app
  by about 480 ms, and copying the profile during that window failed with `ENOENT` on `DIPS-wal`. Wait
  for it to exit before copying.
- **Deleting a profile straight after a kill can fail [ran].** It hit `EPERM` once and cleared within
  83 ms. After a 250 ms wait it worked first time, 2 samples. Retry rather than sleep.
- **`webdriverio` 10 is out, but the service needs 9 [read].** `@wdio/cli` latest is 10.1.0, and the
  service's peer dependency is `webdriverio ^9.0.0`. Pin 9.
- **`pnpm install` ends with exit 1 here [ran]**, with `ERR_PNPM_IGNORED_BUILDS` for `esbuild`, and
  writes an untracked `pnpm-workspace.yaml`. `node_modules` is complete and Vite still works. The scripts
  were not approved. A harness that treats that exit code as fatal would stop.
- **`pnpm add` from a subfolder rewrote the root `pnpm-lock.yaml` while that file was present [ran].**
  It was restored. That file being the cause is likely but not proven **[inferred]**. Worth knowing when
  adding the test dependencies.

### Where the published docs are wrong or out of date

Trust `v1.5.1` source over the [Configuration](https://webdriver.io/docs/desktop-testing/tauri/configuration)
page:

| Docs say | What happens |
|---|---|
| On Windows, with no provider signal, the service throws | `embedded` is the default when unset **[read]** `embeddedProvider.ts:249`. Set it explicitly anyway |
| `tauri-plugin-wdio` is required | Not for driving the UI. Everything here ran without it **[ran]**. It adds `browser.tauri.execute()`, mocks and log capture **[read]** |
| `wdio-webdriver:default` capability is needed | Not needed **[ran]** |
| `cfg(debug_assertions)` dependency "keeps it out of release builds" | It does not **[ran]** |
| The port must be free, or the service fails | It passes silently **[ran]** |
| `env` is for "the spawned tauri-driver process" | With `embedded` it reaches the app **[ran]** |

## What the embedded server adds

`tauri-plugin-wdio-webdriver` runs a W3C WebDriver server inside the app, implemented on WebView2 APIs
[read], and on WKWebView APIs on macOS [read, not run]. It is a fork of `Choochmeque/tauri-plugin-webdriver` [read], and needs no
`msedgedriver` or `tauri-driver`.

- **Network:** binds `127.0.0.1` only, port from `TAURI_WEBDRIVER_PORT`, default 4445 **[read]**
  `server/mod.rs:71`.
- **No authentication [ran].** A second, unrelated client opened its own session on a running instance
  with no credentials. It read the session token out of `localStorage` and reached
  `window.__TAURI_INTERNALS__.invoke`. So any local process can act as the signed-in user. The README
  says to never include it in production builds **[read]**.
- **Dependencies:** adding it locked 21 more packages, including `axum` **[ran]**. It needs `tauri`
  2.10.0 or newer **[read]**.
- **It needs no capability [ran]**, and it works without `tauri-plugin-wdio`.
- **`/status` needs no session**, and reports `tauri-plugin-webdriver is ready` **[ran]**.

### Keeping it out of release builds

**[ran]** Each row is a built binary, launched with `TAURI_WEBDRIVER_PORT` set. The release rows used
`opt-level=0`, no LTO and no strip for speed, so they are not the production profile. How that profile
strips code was not checked.

| Gate | Plugin compiled | Port opens | `TAURI_WEBDRIVER_PORT` in binary | `wdio-webdriver` in binary |
|---|---|---|---|---|
| Documented: `[target.'cfg(debug_assertions)'.dependencies]` plus `#[cfg(debug_assertions)]`, release | **Yes** | No | No | **Yes** |
| Cargo feature off, release | No | No | No | No |
| Cargo feature on, debug | Yes | Yes | Yes | Yes |
| Cargo feature on, **release** | Yes | **Yes** | Yes | Yes |

- **The documented dependency gate has no effect.** Cargo warns: "Found `debug_assertions` in
  `target.'cfg(...)'.dependencies`. This value is not supported for selecting dependencies and will not
  work as expected". Only the `#[cfg]` around `.plugin(...)` keeps the server out.
- **A Cargo feature is the clean gate.** `cargo tree` shows no plugin and no `axum` with it off.
- **A feature protects only as far as nobody passes it.** `.github/workflows/release.yml` passes no
  features, so a non-default `e2e` stays off there **[read]**. A guard in that workflow is cheap.
- **A leftover capability breaks the release build [ran].** With the feature off and
  `wdio-webdriver:default` still listed, the build fails with "Permission wdio-webdriver:default not
  found". Since the capability is not needed, leave it out.

The feature gate that ran:

```toml
[dependencies]
tauri-plugin-wdio-webdriver = { version = "1", optional = true }

[features]
e2e = ["dep:tauri-plugin-wdio-webdriver"]
```

```rust
#[cfg(feature = "e2e")]
let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
```

Built with `tauri build --debug --no-bundle --features e2e`.

## `tauri dev` against a debug build

| | Built debug binary | `tauri dev` |
|---|---|---|
| Launch to WebDriver ready | 312 to 372 ms, 5 samples **[ran]** | 1.3 and 2.3 s warm; 27 s after a Tauri rebuild **[ran]** |
| Launch to first screen, empty profile | **367 to 470 ms**, 5 samples **[ran]** | **24.5 and 25.1 s** warm; 52 s after a rebuild **[ran]** |
| Origin | `http://tauri.localhost` | `http://localhost:1420` |
| Accepted by `convex/auth.ts` | Yes: sign-up worked **[ran]** | Yes: sign-up worked **[ran]** |
| Isolation with the env var | Yes **[ran]** | Yes, with a second instance beside it **[ran]** |
| Points at a test backend through | `VITE_*` at `vite build` time | `VITE_*` when Vite starts |
| Cost of changing the backend URL | About 10 s: 6 s Vite plus 3.7 s Cargo, 2 samples **[ran]** | A restart |
| Needs | The built `.exe` only | Vite on port 1420, with `strictPort`, so one per machine **[read]** |

- **`VITE_CONVEX_URL` is baked in [ran].** A built binary started with bogus `VITE_*` variables still
  signed in against the real local backend. Rebuilding with another URL changed where it connected, and
  Cargo noticed the changed `dist` by itself: only the app crate recompiled.
- **The 10 s rebuild removes the main reason to use `tauri dev`.** Compared with roughly 24 s to first
  screen on every launch, the debug build is cheaper after one run **[inferred]**. Why `tauri dev` takes
  that long was not investigated; Vite transforming unbundled source for a fresh profile is the likely
  cause **[inferred]**.
- **`beforeDevCommand` is `pnpm dev` in this repo.** #5 hit the release-age rule there. These runs called
  Vite directly, so that path was not exercised.
- **First compile:** about 2 minutes on 20 threads here, across attempts, on the `gnu` target **[ran]**.
  An MSVC build was not measured, and the 3.7 s relink may differ on it **[inferred]**.

## Session reuse

WebdriverIO has no storage-state API: `saveStorageState` and `storageState` do not appear in the
`webdriverio` 9.32.0 build **[read]**. The equivalent is a few lines of harness, and it works.

**[ran]** One sample each, from launching the app on the profile named, to the chat screen:

| Route | Time | Notes |
|---|---|---|
| Restart on the same profile | 506 ms | The session survives a restart |
| Boot a copied profile | 506 ms, plus 236 ms to copy | Profile is 11.3 MB in 240 files. Wait for WebView2 to exit first |
| Empty profile, set `localStorage`, reload | **565 ms** | Works with `better-auth_cookie` alone |
| Empty profile, sign in through the UI | 813 ms | 435 ms of that is the form |

- **Storage-state equivalent:** read `better-auth_cookie` with `browser.execute`, then in a new instance
  set it and call `browser.refresh()`. This also closes a gap from #5: a saved session restored in a real
  webview, not a `Map`.
- **The saving is small.** UI sign-in costs about 250 ms more than injecting, and #5 recommended UI
  sign-in because injection depends on a private format. That advice still holds **[inferred]**.
- **A session survives a hard kill [ran].** Killing the app 0, 100, 500 and 2000 ms after sign-up left a
  valid session each time. That matters because the service stops apps with a kill.
- **Keys seen [ran]:** `better-auth_cookie`, `better-auth_session_data`, `chat:sidebar`, `chat:theme`.
  The name inside the cookie store is `better-auth.session_token` on this `http` backend, as in #5.
- **Saved state is tied to the backend** that issued it, as in #5 **[inferred]**. Reusing it across a
  Seed reset was not tested.

## macOS

Everything in this section is **[read, not run]**.

- **Driver:** `embedded` is the only route with no paid dependency. `tauri-driver` has no macOS support
  ([Tauri](https://v2.tauri.app/develop/tests/webdriver/)).
- **Default storage:** with no identifier, `wry` uses `WKWebsiteDataStore::defaultDataStore`
  (`wkwebview/mod.rs:286`), so two instances should share a session as on Windows **[inferred from that
  read]**.
- **`data_directory` is unsupported**, and the `@tauri-apps/api` docs say to use `dataStoreIdentifier`
  instead (`webview.d.ts:700`).
- **`dataStoreIdentifier` needs macOS 14 or newer.** `wry` silently falls back to the default store on
  older versions (`mod.rs:266-286`), so isolation would fail with no error.
- **No environment override exists**, as `WEBVIEW2_*` is Windows only. So macOS needs code in the app:
  under the `e2e` feature, read an instance id from the environment and pass a 16-byte
  `data_store_identifier` when creating the main window. `WindowConfig` also has the field
  (`tauri-utils/src/config.rs:2300`), but that is fixed at build time.
- **Popouts need it too.** `src/lib/popout.ts` would have to pass `dataStoreIdentifier`, or popouts land
  in the default store, as Windows showed with `data_directory` **[inferred]**.
- **`incognito: true`** gives a non-persistent store (`mod.rs:278`). It is simpler, but sessions would
  not survive a restart, and each window might get its own store **[inferred]**.
- **The service's `TAURI_DATA_DIR`** is not read by anything in `tauri-apps` that a code search can find,
  so it should not help here either **[inferred]**.
- **Origin** should be `tauri://localhost`, which `convex/auth.ts` trusts. Not checked.
- **Run-loop handling:** the plugin has macOS-specific code for headless scheduling
  (`platform/macos.rs:160`). Whether two windows at once behave is unknown.

The first things to check on a Mac: two instances, then the data store, then a popout, then the
two-user flow above.

## Other routes

Only as far as the decision needs:

| | WDIO, `embedded` | Playwright over CDP | WDIO, `external` (`tauri-driver`) | CrabNebula |
|---|---|---|---|---|
| Windows | **Ran** | **Ran**, see below | Read only | Read only |
| macOS | Supported [read, not run] | Not possible: CDP is Chromium only, and macOS uses WKWebView [read, not run] | Unsupported [read, not run] | Needs `CN_API_KEY`, a subscription and `tauri-plugin-automation` [read, not run] |
| App change | Plugin behind a feature | None on Windows | None on Windows | Plugin on macOS [read, not run] |
| Isolation | Per-capability env | `WEBVIEW2_USER_DATA_FOLDER` per process | `TAURI_DATA_DIR` has no effect, per-capability `env` not applied [read] | Same `TAURI_DATA_DIR` [read] |
| Extra pieces | None | A debug port per instance | `msedgedriver` matched to WebView2, `tauri-driver` | Driver, and a backend on macOS [read, not run] |

**[ran]** Playwright reached both instances with `connectOverCDP`, using
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`, with no use of the plugin. It
signed up through the UI, and the other instance stayed signed out. It would work on an unmodified
binary too **[inferred]**. `context.storageState()` returned no origins in one try, with no navigation
after connecting; that was not investigated, so do not assume #5's storage state carries over.

Since macOS is a requirement, Playwright over CDP and `external` cannot be the only runner [read, not
run].

## Recommended shape

An input to the decision ticket, not a decision:

1. Runner: `@wdio/tauri-service` with `driverProvider: 'embedded'`, multiremote, `webdriverio` 9.
2. Build: `tauri build --debug --no-bundle --features e2e`, with `VITE_*` set to the local backend.
3. Add a non-default Cargo feature for the plugin, and no capability.
4. Before WDIO starts: check the ports are free, and create a fresh profile folder per instance.
5. Pass the profile through `wdio:tauriServiceOptions.env`, and refuse to run without one.
6. After the run: wait for WebView2 to exit, and delete with retries.
7. Reset state between spec files yourself.

## For the decision ticket

"Which E2E runner and app build do we use?" must weigh:

- **Only one route could cover both platforms for free [read, not run].** `embedded` is proven on
  Windows and unproven on macOS. The map keeps the runner conditional until a Mac confirms it.
- **macOS needs a real app change, Windows does not [read, not run].** Decide whether that code goes in
  behind `e2e` now, or waits for someone with a Mac. It must cover popouts, and macOS 14 becomes a minimum
  for running the suite.
- **The debug build costs one rebuild, about 10 s, when the backend URL changes.** `tauri dev` costs about
  24 s on every launch and ties the machine to port 1420. Fixed local ports, as #4 recommends, mean the
  URL rarely changes.
- **The app gains an unauthenticated control server in test builds.** Accept it behind a feature, and
  decide on a guard in `release.yml`.
- **`tauri-plugin-wdio` is optional.** Adding it brings mocks, `withGlobalTauri` and a frontend import.
  Whether the suite needs mocks is a real question, for example around the updater.
- **The harness has jobs the service does not do:** port preflight, per-instance profiles, resets between
  files, and cleanup. That is real code to own.
- **Dependency risk:** a young third-party plugin, at 1.x with roughly monthly releases, a pinned major
  of `webdriverio`, and published docs that lag the source.

## Not verified

- **macOS.** Nothing ran on a Mac. This is the biggest gap, since the suite must work there.
- **A normal MSVC build.** Everything ran on the `gnu` binary described above, without the updater. The
  installed-app paths, including real icons and the embedded manifest, were not exercised.
- **The production release profile.** Release checks used no LTO and `opt-level=0`.
- **The `external` and `crabnebula` drivers.** Not run. `TAURI_DATA_DIR` was tested directly on the app.
- **A real tab drag-out.** Popouts were opened by the same IPC call.
- **Crash recovery under multiremote.** No crash was injected.
- **`tauri-plugin-wdio`.** Not installed, so `browser.tauri.execute()` and mocks were not tried.
- **Resetting state between spec files**, and a Seed reset under running apps. Both are the harness's job
  and neither was tried.
- **Windows that are locked, minimised or on a machine in use.** Windows were visible on an idle desktop.
- **More than two instances, parallel workers, and long runs.** Stability rests on 4 runs plus the
  experiments here.
- **The cause of the `tauri dev` delay**, and the macOS figures for all timings.
- **Groups, media and settings** through this route.

Nothing touched a cloud deployment. The Convex CLI ran from a stage directory with a fake home folder,
and the bundle held no deployment URL other than the local one. All processes were stopped, and the
research profile under `%LOCALAPPDATA%` was removed.

## Sources

- Repo at `d1b277f`: `src-tauri/Cargo.toml`, `Cargo.lock`, `tauri.conf.json`, `capabilities/default.json`,
  `src/lib.rs`, `convex/auth.ts`, `src/lib/popout.ts`, `src/lib/auth-client.ts`, `src/App.tsx`,
  `src/components/auth-screen.tsx`, `invite-modal.tsx`, `chat-app.tsx`, `vite.config.ts`,
  `.github/workflows/release.yml`.
- Earlier findings: `docs/research/local-convex-backend.md` and `docs/research/playwright-better-auth.md`,
  on their branches.
- [`webdriverio/desktop-mobile`](https://github.com/webdriverio/desktop-mobile) at tag
  `wdio-tauri-service@v1.5.1`: `packages/tauri-service/src/{launcher,embeddedProvider,service,serviceConfig,types,pluginValidator}.ts`,
  `packages/tauri-service/docs/`, `packages/tauri-plugin-webdriver/` (`README.md`, `Cargo.toml`,
  `src/lib.rs`, `src/server/mod.rs`, `src/server/handlers/session.rs`, `src/platform/macos.rs`),
  `docs/architecture/cross-platform.md`.
- Crate source: `tauri` 2.12.5 `src/manager/webview.rs`, `src/webview/webview_window.rs`; `tauri-utils`
  `src/config.rs`; `wry` 0.57.1 `src/webview2/mod.rs`, `src/wkwebview/mod.rs`; `tauri-build` 2.7.4;
  `embed-resource` 3.0.12; `webview2-com-sys` 0.39.1.
- `@tauri-apps/api` 2.12.4: `webview.d.ts`.
- Tauri: [WebDriver](https://v2.tauri.app/develop/tests/webdriver/),
  [Configuration](https://v2.tauri.app/reference/config/).
- WebdriverIO: [Tauri Service](https://webdriver.io/docs/wdio-tauri-service),
  [Configuration](https://webdriver.io/docs/desktop-testing/tauri/configuration),
  [Plugin Setup](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup).
- Microsoft: [Manage user data folders](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder),
  [WebView2 Win32 reference](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/webview2-idl).
- Cargo: [Platform specific dependencies](https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#platform-specific-dependencies).

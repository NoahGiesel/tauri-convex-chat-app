# PROTOTYPE, throwaway. Never merged.

Answers [What does a two-user realtime test look like?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/9) on the map in issue #3. It mirrors the decided design closely enough to prove it. It is not the implementation.

Windows: `pnpm install`, then `pnpm e2e:proto`. Add `--no-build` to reuse the last Test build. About 2.5 minutes, of which 100 s is two deliberate 50 s waits in the write probes.

| File | What it is |
|---|---|
| `run.mjs` | The harness: port check, build, backend, Seeds, `wdio run`, clean-up |
| `seeds.mjs` | Base Seed and `friends` Seed, through real sign-up and public functions |
| `stage-seed.ts` | The internal function, copied into the stage's `convex/` only |
| `fixtures.mjs` | The Reset sequence and a small page object |
| `two-users.spec.mjs` | The two-user test, plus the Reset probes and the control |

Outside this folder the branch changes `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src/main.tsx` and `src/hooks/use-updater.tsx`, and adds `pnpm-workspace.yaml`.

## Checklist for a Mac

Goal: find out whether this runs on macOS, for [Does the chosen runner work on a Mac?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/13). Nothing here has ever run on a Mac, so expect to adjust it. Record what fails as well as what works.

### Before you start

- [ ] macOS 14 or newer. Record the exact version and whether the machine is Apple silicon or Intel.
- [ ] Xcode Command Line Tools, Rust, Node 22 or newer, and pnpm through corepack.
- [ ] No Convex login or `.env.local` is needed. Ports 3310, 3311, 4540 and 4541 must be free.

### Set up

1. `git fetch origin && git switch prototype/two-user-e2e`
2. `pnpm install`

### Change the prototype for macOS

3. In `config.mjs`, set `APP_ORIGIN` to `tauri://localhost`, and remove `.exe` from `EXE`.
4. In `run.mjs`, confirm the `junction` link in `makeStage` created a working `node_modules` link.
5. In `wdio.conf.mjs`, replace `WEBVIEW2_USER_DATA_FOLDER`, which does nothing on macOS, with a variable such as `E2E_INSTANCE`, set to a different value per instance.
6. Behind the `e2e` feature, create the main window in Rust with a 16-byte `data_store_identifier` derived from `E2E_INSTANCE`. Set `create: false` on that window, in the `--config` override only.
7. Pass the same `dataStoreIdentifier` when `src/lib/popout.ts` creates a `chat-*` window.

### Run

8. `pnpm e2e:proto`
9. Record for each of the 8 tests: passed or failed, and the error if it failed.
10. Run it two more times with `--no-build`, and record any test that changes result.

### Check by hand

- [ ] **Isolation control.** Remove step 6's identifier and run again. The two users must collapse into one session. If they do not, the control proves nothing, so say so.
- [ ] **`about:blank`.** Confirm `reset: quiet apps` still completes. WKWebView may treat it differently from WebView2.
- [ ] **Sign-in origin.** Confirm sign-in works from `tauri://localhost`, which `convex/auth.ts` trusts.
- [ ] **Popout.** Open a chat in its own window on one instance, and confirm it is signed in as that instance's user.
- [ ] **Windows at once.** Confirm two windows run without either one stalling while unfocused.
- [ ] **Loopback.** From the webview, `fetch('http://127.0.0.1:3311/api/auth/ok')`. The stub on port 3312 depends on `tauri://localhost` being allowed to reach `http` loopback.
- [ ] **Below macOS 14.** If you can test one, confirm isolation fails silently. The suite must refuse to run there.

### Report on the ticket

The macOS version, the three run results, the timings the harness prints, the control result, and every change you had to make to this checklist.

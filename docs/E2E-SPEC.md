# E2E test suite spec

This spec describes an E2E suite that runs inside the real Tauri app, on a developer's machine. When the suite is trusted, the only manual QA left before a release is the installed app's native behaviour and a short **Manual smoke**.

Terms such as Test backend, Test build, Seed, Reset, Fixture, Driven user and Scripted user are defined in [`GLOSSARY.md`](../GLOSSARY.md).

Decisions and evidence come from [the map](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/3). The throwaway prototype is on the [`prototype/two-user-e2e`](https://github.com/NoahGiesel/tauri-convex-chat-app/tree/prototype/two-user-e2e) branch, which is never merged. Use it as a reference, not as code to copy: it contains probes and known shortcuts.

## Status of this spec

**Windows is proven in part, and macOS is not proven at all.** Nothing has run on a Mac, and [Does the chosen runner work on a Mac?](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/13) is on hold. So the runner choice stays conditional.

Most scenarios are not written. The prototype proved the design with 8 tests and a set of probes. See [What is not verified](#what-is-not-verified) before relying on any claim here.

## Scope

**In scope:** 68 scenarios in two phases, plus a few unit tests.

**Out of scope:**

- Automating the installer, updater, system notifications or the Dock badge. They stay manual.
- Running the suite in CI. It runs locally only.
- Calling live R2, GIPHY or link targets. The Manual smoke covers real services.

## Rules that must not be broken

1. **Never point the suite at the production Convex deployment.**
2. **The target is not configurable.** The suite knows only `http://127.0.0.1:3310` and `http://127.0.0.1:3311`, set in its code. No flag or environment variable changes them.
3. **The developer's environment is not inherited.** The suite ignores `.env` files and removes every `CONVEX_*` variable from the commands it starts. This matters most for `convex import --replace-all`, which wipes whatever deployment it reaches.
4. **Busy ports stop the run.** The service would otherwise drive an old app silently, and pass.
5. **Every running app is checked.** Before the first sign-in, the suite reads `window.__E2E__` from every instance. A missing or non-loopback URL stops the run.
6. **An app instance needs an explicit profile.** The harness creates one per instance and refuses to start without it, because a Test build could otherwise reach a real session.
7. **The test secret stays a test secret.** `BETTER_AUTH_SECRET` is one fixed test-only value kept in the repo. It must never be used on a real deployment.
8. **Seed code never enters the repo's `convex/` folder.** `npx convex deploy` works from that folder.
9. **The Test build never ships.** See [Keeping the Test build out of releases](#keeping-the-test-build-out-of-releases).

## What `pnpm e2e` does

The order matters. The work happens outside WDIO, because `wdio.conf` is evaluated once in the launcher and again in each worker.

1. Check that ports 3310, 3311, 3312, 4540 and 4541 are free.
2. Build the Test build. There is no skip flag and no cache, so a run never tests an old binary.
3. Start the Test backend and the stub.
4. Build the Seeds and their snapshots.
5. Run `wdio run`, one test at a time, on two instances: `alice` on 4540 and `bob` on 4541.
6. Clean up, including after a failure: stop everything, wait for WebView2 to exit, and delete profiles with retries.

`pnpm e2e --grep "<test>"` runs matching tests only, with the same full start.

Everything lives in a new `e2e/` folder. `e2e/.stage`, `e2e/.profiles` and `e2e/.failures` are git-ignored.

## App changes

These are the only production files the harness needs. The prototype made all of them except `data-testid`, `dayLabel` and the release changes.

| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Optional `tauri-plugin-wdio-webdriver`, behind a non-default `e2e` feature |
| `src-tauri/src/lib.rs` | Add the plugin under `#[cfg(feature = "e2e")]` |
| `src/main.tsx` | Under `import.meta.env.VITE_E2E`, publish `window.__E2E__` with the Convex URL |
| `src/hooks/use-updater.tsx` | Add `import.meta.env.VITE_E2E` to the early return of the automatic check |
| `convex/r2.ts` | Use an optional `R2_ENDPOINT` in place of `https://${host}` |
| `src/lib/giphy.ts` | Use an optional `VITE_GIPHY_API_URL` |
| `pnpm-workspace.yaml` | New file, `allowBuilds` set to `false` for `esbuild`, `edgedriver` and `geckodriver` |
| `src/components/conversation-view.tsx` | Move `dayLabel` out into a pure function that takes the current time |
| Components | Add `data-testid` where no accessible name exists |
| `src/components/invite-modal.tsx` | Name each row's button after the person, in every language |
| `.github/workflows/release.yml` | Add the release guard, and set `releaseDraft: true` |
| `docs/DEPLOY.md` | The new release checklist |
| `package.json` | `e2e` script and dev dependencies |

- **Use a Cargo feature, not `cfg(debug_assertions)`.** The gate in the plugin's docs leaves the plugin compiled into release builds.
- **Do not list `wdio-webdriver:default` as a capability.** With the feature off, a leftover entry fails the build.
- **`tauri-plugin-wdio` is not added.** Nothing needs its mocks.
- **`pnpm-workspace.yaml` is required.** Without it, every pnpm 11 script fails on a clean install with `ERR_PNPM_IGNORED_BUILDS`. `release.yml` uses pnpm 10, so this does not reach it.

## Runner and Test build

The suite runs on `@wdio/tauri-service` with the `embedded` driver, in multiremote, with `webdriverio` pinned to 9. It is the only free route that could cover both Windows and macOS.

The prototype used `webdriverio` 9.32.0, `@wdio/tauri-service` 1.5.1 and `tauri-plugin-wdio-webdriver` 1.5.1. The plugin is young and its docs lag its source, so pin these versions.

`pnpm e2e` builds with:

```
tauri build --debug --no-bundle --features e2e --config <identifier override>
```

The harness sets these variables for the build:

| Variable | Value |
|---|---|
| `VITE_CONVEX_URL` | `http://127.0.0.1:3310` |
| `VITE_CONVEX_SITE_URL` | `http://127.0.0.1:3311` |
| `VITE_E2E` | `1` |
| `VITE_GIPHY_API_URL` | `http://127.0.0.1:3312/v1/gifs` |
| `VITE_GIPHY_API_KEY` | A fake key |

`VITE_E2E` does two jobs: it exposes the backend URL, and it switches off automatic update checks. A `vite build` has `import.meta.env.DEV` false, so the real update endpoint would otherwise be called during tests. In a release, Vite removes the guarded code.

**Isolation.** The Test build uses the identifier `dev.NoahGiesel.chat.e2e`. On Windows, each instance gets its own `WEBVIEW2_USER_DATA_FOLDER`, passed through `wdio:tauriServiceOptions.env`. That folder is the only thing that keeps two instances apart, and it also follows popouts. `TAURI_DATA_DIR` has no effect on Windows.

### Keeping the Test build out of releases

A step in `.github/workflows/release.yml` fails if the release build enables the `e2e` feature or sets `VITE_E2E` or `VITE_GIPHY_API_URL`. It must check what the build uses, because the `e2e` feature always exists in `Cargo.toml`. With the feature on, an unauthenticated WebDriver server would be in the build, and any local process could read the session token.

The step, `e2e/release-guard.mjs`, reads what a release names, so it fails early and can run locally with no tag. A text scan cannot see every route, so the build holds the last stop: `src-tauri/src/lib.rs` refuses the feature outside a debug profile, and `vite.config.ts` refuses the variables outside a `--debug` Tauri build.

## Test backend

The Test backend is a fresh anonymous local Convex deployment that one run creates, owns and stops. It never uses a cloud deployment.

- **Start it with `convex dev` from a disposable stage directory, `e2e/.stage`.** `convex dev` rewrites `.env.local` in its working directory. `npx convex dev --local` no longer exists.
- **Prepare the stage.** Copy `convex/` and `package.json`, link `node_modules`, then copy the internal Seed file into the stage's `convex/`.
- **Confirm the target.** Refuse to continue unless the stage's `.env.local` names the anonymous deployment on `127.0.0.1:3310`.
- **Set `BETTER_AUTH_SECRET` before any auth call.** A later change makes every token mint return 500 while sign-in still returns 200. With no secret, Better Auth silently uses a public default.
- **Set the fake R2 values with `convex env set --from-file`:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` and `R2_ENDPOINT=http://127.0.0.1:3312`.
- **Pin the backend version** with `--local-backend-version`. The prototype used `precompiled-2026-10-22-1447815`. This flag and the port flags are hidden from `--help`, so an upgrade can change them.

The CLI binds the backend to `0.0.0.0`. This is accepted, because it holds only fake data and a test-only secret.

## Seeds

Seeds are built at the start of every run and saved as snapshots with `convex export` into the stage. None is committed or cached, so they always match the current schema.

- **Use real paths first.** A script signs each user up over HTTP, fetches a token, then calls public functions as that user. So Seed code never duplicates `pairKey`, `directKey` or member rows.
- **Build sessions with the package's helper.** `getSetCookie` from `@convex-dev/better-auth/client/plugins` writes the `localStorage` format, so the harness copies no private format.
- **Use the internal fallback only for what public functions cannot make.** It is called by name with `convex run`, and it typechecks only inside the stage.
- **Fix `avatarIndex`** with the internal function, because it is random.
- **A snapshot is tied to the secret and the site port.** The wrong port fails silently: `users:me` returns `null`, and `ensureProfile` creates a second profile.
- **No Seed can make an old message.** `_creationTime` is set by the server on every path. See [Unit tests](#unit-tests).
- **Tests refer to names and text, never IDs.** IDs differ between runs.

| Seed | Extends | Holds |
|---|---|---|
| `base` | Nothing | Alice, Bob and Carol, with no relationships |
| `friends` | `base` | Alice and Bob are friends, with a direct chat and one message. Carol is a stranger |
| `groups` | `friends` | All three are friends, in a group chat called Weekend with one message. Carol has a `lastSeenAt` over 2 minutes old |
| `history` | `friends` | 70 more messages in the direct chat, so at least two pages of 30 |
| `expired-invite` | `base` | An expired invite from Alice, with a fixed token |
| `media` | `friends` | A photo, a video, a link with a Seeded preview, and an avatar for Alice |

`media` is exported with `--include-file-storage`, because avatars live in Convex file storage. Its preview row comes from the existing internal `previews:save`. Its photo and video go up the app's own way, a signed address from `media.createUpload` and then a PUT, so they land in the stub, which a Reset does not touch. `MEDIA_SEED` in `config.mjs` names what it holds.

An import does not empty Convex file storage, so a file from an earlier Seed is still there after a Reset to a snapshot without it. So the avatar test first removes Alice's photo, which deletes its file, and only then checks that a Reset brings it back. Without `--include-file-storage` that test fails, and checking the photo alone did not.

Carol's `lastSeenAt` and the expired invite use the internal fallback. `groups`, `history`, `media` and `expired-invite` branch from an earlier Seed, so building them needs a Reset first.

## Reset

A Reset runs before every test, so tests never depend on order and any one can run alone. A Fixture consumes exactly one Seed, because a Reset replaces the whole database.

The Fixture owns the sequence, in this order:

1. Close any popouts left open.
2. Clear `localStorage` and restore each user's session, except for `signedOut`, which starts with none. This must come first, because `about:blank` has no `localStorage`.
3. Take both instances to `about:blank`. Wait until each one really is there, because `url()` returns before the navigation ends.
4. Run `convex import --replace-all --yes <seed>.zip`.
5. Load the app in both instances, and wait until each one has loaded.

Step 3 is required. Live apps write into freshly imported data through `heartbeat` and `markRead`, on every run.

Stub files are not touched by a Reset.

## Fixtures and scenarios

One Fixture per scenario returns one object per user, with domain actions such as `send`, `sees` and `openChat`. A test holds no selectors and no waits:

```js
it('each sees the other message', async () => {
  const { alice, bob } = await twoFriendsWithChatOpen();

  await alice.send('Hi Bob');
  await bob.sees('Hi Bob');

  await bob.send('Hi Alice');
  await alice.sees('Hi Alice');
});
```

Every run has two Driven users, `alice` and `bob`. Single-user tests leave `bob` idle. A third user is a Scripted user, who acts through public functions with a token from their session. Carol has no UI of her own, so her reads go through queries.

### Phase one

| Fixture | Seed | Hands to a test | Scenarios |
|---|---|---|---|
| `signedOut` | `base` | `alice`, `bob` on the auth screen | Sign-up, sign-in, wrong password, session survives a reload, sign-out |
| `strangers` | `base` | `alice`, `bob` signed in | Search, request, accept, decline, cancel, crossed requests, invite link, own invite, used invite, remove friend |
| `expiredInviteLink` | `expired-invite` | `bob` signed in, and the link | An expired link is refused |
| `twoFriends` | `friends` | `alice`, `bob` with no chat open | Unread badge appears and clears, presence online, open a chat from the list |
| `twoFriendsWithChatOpen` | `friends` | `alice`, `bob` with their chat open | Messages both ways, edit, delete, reactions, `/me`, `/code`, `/pre`, `/spoiler`, `/quote`, `/random`, `/flip` |
| `longChat` | `history` | `alice` with the chat open | Load older messages, jump to latest |
| `groupChatOpen` | `groups` | `alice`, `bob` in Weekend, and `carol` as a Scripted user | Messages between three, create a group, members, online count |
| `soloWithChats` | `groups` | `alice` with all chats, `bob` idle | Folders, chat order, chat search, tabs, split view, popouts, "Last online" |

`/random` and `/flip` are random by design, so tests check the shape of the result.

### Phase two

| Fixture | Seed | Hands to a test | Scenarios |
|---|---|---|---|
| `twoFriendsWithChatOpen` | `friends` | `alice`, `bob` with their chat open | Send a photo, send a video, caption, several files, remove a staged file, wrong type, too many files, GIF picker, `/giphy` |
| `mediaChatOpen` | `media` | `alice`, `bob` with their chat open, and `storage`, the stub's record of deletions from the Reset on | Seeded attachment, lightbox, media library, link library, Seeded preview card, delete an attachment, a `.invalid` link shows no card |
| `settingsOpen` | `friends` | `alice` in Settings, `bob` with the chat open | Name and bio seen live by Bob, set and remove an avatar, language, theme, sidebar side, accent colour, theme import, notify switch |

- **Video:** a small real mp4 joins `e2e/`. A test sends it and checks that Bob's player loaded its metadata. WebView2's player reads the metadata of `e2e/assets/clip.mp4`: 2 s of H.264 Constrained Baseline, 160 by 120, no sound, `faststart`, 10 KB. It was made with `ffmpeg -f lavfi -i testsrc=size=160x120:rate=15:duration=2 -c:v libx264 -profile:v baseline -pix_fmt yuv420p -movflags +faststart -an`. WKWebView may need a specific codec.
- **Profile:** the first settings test chooses a profile photo through `avatar-input`, so it also proves a file input in Settings takes the upload helper. In the main window a chat has no header, so Bob sees Alice's new name and bio on her profile, which he opens from her name on "Seeded hello" before she saves. That profile is named after her, so it shows the new name too. Its tab and its row in the list are checked as well. The sender's name on a message opens the profile, but it is a `<strong>` with a click handler, not a button, so it has no role and the Fixture finds it by its tag. Making it a button is an app change for its own ticket.
- **Language:** one test walks through all five languages, checks one label from each dictionary, then reloads and checks that the last choice stayed. The label is the language list's own name, `auth.language`, and after the reload the Settings button's. The Fixtures import all five dictionaries for this. The language list itself is found by its options, because its name changes with every choice. A `<select>` cannot be typed into, so a Fixture sets its value through the native setter and fires `change`, which is what React reads. The custom accent's colour picker is set the same way, with `input`.
- **Appearance:** tests choose a preset, light mode, a custom accent and the sidebar side. A theme counts as applied once its card says "In use" and its background is the page's `--app-bg`. The sidebar counts as moved once the Settings button, which sits in it, is in the right half of the window.
- **Theme import:** a synthetic `change` works. A test imports `e2e/assets/harbour-theme.json` through `theme-import-input`, the third of the file inputs, and sees it in use. Another imports `note.txt` and is told it is not valid JSON.
- **Updates:** only the notify switch is tested, off and still off after a reload. "Check for updates" would call the real endpoint. Opening Settings › Updates checks nothing, because the Test build turns automatic checks off.

## Driving the app

### Finding elements

Selectors live only in the Fixture layer. They use accessible names from the English dictionary, so changing a label does not break a test. A control that loses its accessible name does break one, and that is intended.

```js
const composer = () => b.$(`aria/${en['chat.composer']}`);
```

- **All tests run in English**, because a Reset clears `chat:lang`.
- **Seed data stays literal.** Names like `Bob Test` and message bodies are test data.
- **A chat in the list is found by its tooltip**, its title then its presence, such as `Bob Test · Online`. The row's accessible name is its content, and that also holds the unread count.
- **`data-testid` is the exception.** Use it only where no accessible name exists. The starting list is the tab drop zones, the message row and the three file inputs. The media library got `role="region"` and the name "Media", the same as the button that opens it. If a person sees a control, it gets a real name instead.

### Waiting

**Every wait looks the element up again on each poll.** A Fixture never holds an element across a wait. Waiting on a held element right after sending a message timed out falsely in 4 of 12 runs, against 0 of 12 with a fresh lookup. The likely cause is the optimistic update replacing the message row, which was inferred from the code.

```js
await b.waitUntil(async () => b.$(selector).isDisplayed(), { timeout: 5_000, interval: 100 });
```

A test has no fixed pauses. A check that something is absent runs only after a `sees` has proved the screen rendered.

### Clicking

The driver's `click()` is synthetic. It presses a button under a full-screen cover, and a button with `display: none`. So a successful click does not prove a person could have done it.

- **`press()` is the default.** It waits for `isClickable`, then clicks.
- **`pressHoverOnly()` is the exception**, for actions shown only on hover. It checks that the element is hidden, then clicks it. If an action stops being hover-only, the check fails and the test moves to `press()`.
- **`pressWithPointer()` is for a button that starts a smooth scroll**, such as "Jump to latest message". The driver's `click()` focuses the button after the click, and that focus stops the scroll partway. A pointer down and up focuses first, as a mouse does, and the scroll finishes.

Hover cannot be driven. `moveTo` does not trigger `:hover`, and a pointer move onto a hidden element fails with `could not read element center`. Message actions, the tab close button and the section controls all depend on hover.

`opacity-0` reads as hidden. WebdriverIO 9's `isDisplayed` calls `checkVisibility` with `opacityProperty`, so `isClickable` is false for the folder controls, Rename and Delete, and they go through `pressHoverOnly()`. The other section controls are always shown, and go through `press()`. The same holds for a tab's close button: it shows on the tab of the focused chat, which goes through `press()`, and only on hover on any other tab, which goes through `pressHoverOnly()`. In a split view, only one of the chats in view is focused.

**Focus events need the window in front.** The two instances take turns in front, and Chromium fires no focus or blur events in a window in the background. There a new folder's name field opened with no text chosen, so typing added to "New folder", and Enter could not leave the field. Seen in 2 of 2 tests on one run. The app also marks a chat read only while its window has focus. So the folder actions, and reading a chat to clear its unread badge, first bring their window to the front, with the app's own `set_focus`, which the app's capabilities already allow.

Only those actions do it. Bringing the window forward on every press made 4 tests fail in one run: Windows lets a window take the front only while no other app is in use, and the developer was using one. It also let a stray key reach a test: "bob" typed into a search box once became "bobs". Those tests can still fail while another app is in use or the screen is locked, and say so.

### Dragging

WebDriver's `dragAndDrop` does nothing in WebView2 with the `embedded` driver, because no `dragstart` fires. Dispatch synthetic `DragEvent`s with a real `DataTransfer` from `execute` instead:

```js
const dataTransfer = new DataTransfer();
const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
fire(source, 'dragstart');
// wait for the drop targets to render
fire(target, 'dragover');
fire(target, 'drop');
fire(source, 'dragend');
```

This moved a chat into a folder, split a tab into two panes, and opened a real popout that was signed in and could be driven. It also reorders chats and sections, which take the `clientY` of the event to choose above or below. It skips the gesture itself, so the Manual smoke holds the three real gestures.

The Fixture's helper looks the target up only after `dragstart`, because some targets show only during a drag, and waits two frames after each event, so React has rendered what it changed.

A popout's address holds the conversation ID, so tests must not depend on it across runs. Its window handle is its Tauri label, `chat-<conversation ID>`, so the Fixture finds a popout as the one handle that was not there before the drag. The main window's handle is `main`.

A drag out of the window is `dragstart` on the tab, a `dragleave` on the document with no `relatedTarget`, then `dragend` outside the window.

**A popout left open breaks the next test.** The app focuses an open popout instead of opening a second one for the same chat, so a Reset must close it. With the Reset's first step removed, the next popout test found no new window.

### Uploading

The `embedded` driver refuses files: `sending keys to a file input (file upload) is not supported`. Set `input.files` from a `DataTransfer` and fire a `change` event. The app then runs its real upload. The native file picker stays in the Manual smoke.

The files live in `e2e/assets`. The app re-encodes a photo before upload, and the small PNGs came back as WebP, so a Fixture finds a sent photo by its name before the extension. A photo counts as seen only once it has loaded, with `naturalWidth` above 0. A video counts as seen once its player has read the metadata, with `readyState` at `HAVE_METADATA` or more and a duration above 0. Playing and seeking are not checked.

## External services

The suite never depends on a live service, so a developer needs no credentials and no account. Once its tools are installed, a run needs no internet. The one request a run sends out is for a sent GIF's image, which no test waits for (see below).

| Service | Treatment | App change |
|---|---|---|
| Cloudflare R2 | Local stub | Optional `R2_ENDPOINT` |
| GIPHY | Local stub | Optional `VITE_GIPHY_API_URL` |
| Link previews, YouTube oEmbed | Seeded rows, plus unit tests | None |

**The stub** is one small Node server in `e2e/`, on the fixed loopback port 3312. `pnpm e2e` starts it as a process of its own, because a Seed's CLI call blocks its own process while Convex may call the stub. It keeps its files and its log in the stage, so each run starts with none. If the port is busy, the run stops.

- **R2:** it stores on PUT and serves on GET, with CORS. It checks no signatures. **DELETE is only logged**, and the file stays, so a Reset cannot bring back a message whose image is gone. A test checks a deletion by reading the stub's log.
- **GIPHY:** it returns canned `trending` and `search` results, with thumbnails from the stub. With no search the results are "Trending 1" to "Trending 3", and a search for "Happy cats" finds "Happy cats 1" to "Happy cats 3". `stub.mjs` exports the titles and each one's giphy.com address, so the Fixtures and the stub cannot disagree. The Test build points `src/lib/giphy.ts` at the stub with `VITE_GIPHY_API_URL`. A release stops if it sets that variable.

**Sent GIFs keep a giphy.com address**, because `messages.sendGif` accepts only `https` URLs on `*.giphy.com`, and that guard stays. So a sent GIF's image does not load in tests, and a test checks its address, not its pixels. The webview still asks media.giphy.com for it, so this is the one request a run sends out. `/giphy` picks a result at random, so its test accepts any of the three, under the line showing the search. The composer's GIF button has a name only in English, "GIF", so a Fixture finds it by that and by its `aria-expanded`.

**Link previews.** A test sends only Seeded URLs or reserved `.invalid` ones, so nothing leaves the machine. A test that expects no card first asks the server through a public function, and waits until it has saved the failed preview, so the card cannot still be on its way. `isPublicHttpUrl` stays strict, with no bypass, so the real fetch runs only in the Manual smoke.

## Unit tests

Vitest and `convex-test` join the repo as dev dependencies, for what E2E cannot reach:

- **`dayLabel`:** today, yesterday, older dates and midnight. E2E tests see only "Today".
- **`parseHtml` and `fetchPreview`,** with a stubbed `fetch`, including the YouTube lookup.

`pnpm test` runs them. The tests of `convex/` live beside the code, because `convex deploy` skips a file name with more than one dot.

The `Messages` type already fails the build if a language misses a key, so no key test is needed.

## Reliability

| Question | Decision |
|---|---|
| Interface wait | 5 s |
| One whole test, Fixture included | 30 s |
| Retries | None. A failed test fails the run |
| On failure | Save a screenshot of both instances |
| Flaky test | A bug. Fix it or remove it, with no quarantine |
| Dead instance | Stop the run, name the instance and the last test, and do not restart |
| Run time | The run prints its timings, and warns over 10 minutes. It does not fail |
| Trust | 10 full green runs in a row before the matching manual QA goes. A red run resets the count |

**Why no retries:** a retry would have hidden the false timeout described above, which failed 1 time in 3. A green rerun of one test helps with diagnosis, and it does not clear the failure.

**A dead instance:** ping both instances in a root `afterEach`, which also covers the last test of a run. A throw there stops all later tests. With no handling, each later test fails alone in about 1.5 s. All spec files share one WDIO worker, because a worker per file would start new apps and carry on. WDIO also fails when it closes the dead session and loses its report, so the ping prints the instance and the last test itself.

**A failed test** leaves one picture per instance in `e2e/.failures`, saved in the same hook. WDIO's `afterTest` would race the next Reset after a timeout, because Mocha does not wait for it. The next run clears the folder.

**A mistyped `--grep`** fails the run, because WDIO calls a run with no tests a success.

The prototype's check that quiet apps do not write waits 50 s, which is over the test limit. It stays out of the suite, and the Reset's quiet step stays.

## Measured on Windows

These come from one machine with very little data. Treat them as orders of magnitude.

| Step | Time |
|---|---|
| First `tauri build` | 76 s |
| Later `tauri build` | 15 to 17 s |
| Backend start and function push | 2.6 to 4.6 s |
| All Seed work, four Seeds | 9.6 s |
| Building `history`: a Reset, 70 messages sent one at a time, and the export | 3.3 to 3.7 s |
| Reset plus Fixture, 40 idle rounds | Median 2.2 s, max 2.4 s |
| Reset plus Fixture, 20 rounds with all cores busy | Median 3.9 s, max 6.1 s |
| Message reaches the other user, idle | Median 28 ms, max 138 ms |
| Message reaches the other user, all cores busy | Median 104 ms, max 253 ms |
| Seven tab, split view and popout tests, Fixtures included | 19 s |
| Six photo tests, Fixtures included | 15 s |
| Sending the 10 KB video, Fixture included | 2.4 s |
| Three GIF tests, Fixtures included | 7.7 s |
| Seven tests on the `media` Seed, Fixtures included, two with a second Reset | 10 s |
| Four profile tests, Fixtures included | 10 s |
| Seven appearance tests and the language walk, Fixtures included | 24 s |

**A full run should take about 7 minutes.** That is an estimate: 68 scenarios at about 5 s each, plus about 40 s to start.

## Release process

`pnpm e2e` becomes a blocking step before anything reaches production, and the Manual smoke runs on a draft release, so a failure never reaches users. [`DEPLOY.md`](DEPLOY.md) holds the working checklist.

| Step | What happens |
|---|---|
| 0 | Both `tsc` checks, then `pnpm e2e`, on Windows |
| 1 | `npx convex deploy` |
| 2 | Commit and push |
| 3 | `pnpm version`, then push the tag |
| 4 | `gh run watch` until the draft release is ready |
| 5 | The Manual smoke, on the draft |
| 6 | `gh release edit v<version> --draft=false` |
| 7 | Check that the previous version updates |

- **`pnpm e2e` runs on every release, with no exceptions.** If it fails, there is no deploy and no tag.
- **If the code changes after a run, it runs again,** because `pnpm e2e` tests the working tree.
- **It runs on Windows** until a Mac is verified. Someone releasing from a Mac asks the other dev for the run.
- **`release.yml` makes a draft release** (`releaseDraft: true`). Before, `latest.json` went public when the build ended.
- **An agent may run `pnpm e2e`,** but it stops before step 5 and hands the smoke to a person. It runs step 6 only when asked.

**Full Manual smoke,** on the releaser's system, with the app installed from the draft:

1. Install, open and sign in.
2. Send a photo through the real file picker.
3. Send a GIF.
4. Send a link and see its preview.
5. Drag a chat into a folder.
6. Drag a tab into a split view.
7. Drag a tab out of the window.
8. Hover a message and see its actions.
9. Get a system notification.
10. See the Dock badge, on macOS.

**Short Manual smoke,** on the other system: install, open, a system notification, and the Dock badge if that system is macOS. A releaser without access to the other system says so in the release notes.

**Step 7** needs a published release. The smoke replaces the installed version, so it needs the previous version on the other system, or a reinstall of it.

| Failure | What to do |
|---|---|
| `pnpm e2e` | Stop. Fix it and run it again |
| Smoke | Do not publish. Delete the draft with `gh release delete v<version>` and the tag, fix it, and redo the version |
| Updater, after step 6 | Ship a new patch |

After a failed smoke the backend stays on production, because an old app keeps working against a newer backend.

**During the transition,** the full manual QA stays until the suite has 10 full green runs in a row. An area only leaves manual QA once its phase is written and trusted.

## macOS

The macOS code is written (issue #49) and has not been run on a Mac yet: `pnpm e2e` accepts macOS, and the first run there decides what is left. Whoever verifies on a Mac must:

- **Isolate instances.** macOS has no environment override, and `data_directory` is unsupported. Behind `e2e`, the app passes a `dataStoreIdentifier` for every window, popouts included.
- **Refuse to run below macOS 14.** Older versions silently fall back to a shared store.
- **Check that a request from `tauri://localhost` to `http://127.0.0.1` works,** or the stub cannot be reached.
- **Check the driving techniques in WKWebView:** synthetic drag and upload events, `isClickable`, the driver's `click()`, and whether hover behaves any differently.

## What is not verified

**Everything on macOS.** Every number above may differ there.

**Not built or not run anywhere:**

- The release guard and `releaseDraft: true` with two platforms. Tags must not be pushed to test it, so the first real release is the test.
- A `media` Seed with a video and a link message. The prototype's had neither.
- A real video anywhere but WebView2.
- Whether the resolver asked about a `.invalid` host sends the question out. RFC 6761 tells resolvers to answer it themselves.
- A video served in parts. The stub ignores `Range` and always sends the whole file, where R2 answers a range with 206.
- Most scenarios. The probes covered a group chat, the unread badge, presence, the three drag cases, one photo upload, one deletion, the GIF picker, `/giphy` and one preview card. Settings ran nothing.

**Open behaviour:**

- A crashed popout.
- An app that hangs without exiting. The ping and each request have limits, but only a killed app was tried.
- Accessible names on the other modals. Only an open chat, two Settings screens, the auth screen and the friend screens were checked.
- A large Seed. Reset time was measured on very little data.
- Windows Firewall prompts, locked or minimised windows, and Seeds across a backend upgrade.
- Real system notifications may appear during a run, because `use-message-notifications.ts` is not gated. They are harmless to tests.

## Implementation order

The work is split into vertical tickets. Each one is verifiable alone, and GitHub holds the blocking edges. Tickets 18, 19 and 20 need a person.

1. [Two friends exchange a message in the real app](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/30)
2. [A release cannot contain the Test build](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/31)
3. [A failed run explains itself](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/32)
4. [Day labels and link previews have unit tests](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/33)
5. [Sign-up, sign-in and sign-out are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/34)
6. [Friendships and invites are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/35)
7. [Message actions are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/36)
8. [Unread, presence and long chats are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/37)
9. [Group chats are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/38)
10. [The sidebar is covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/39)
11. [Tabs, split view and popouts are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/40)
12. [Sending photos is covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/41)
13. [Sending a video is covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/42)
14. [GIFs are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/43)
15. [Seeded media and link previews are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/44)
16. [Profile settings are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/45)
17. [Appearance and language settings are covered](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/46)
18. [Releases go out through a draft](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/47)
19. [The suite earns trust](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/48)
20. [The suite runs on macOS](https://github.com/NoahGiesel/tauri-convex-chat-app/issues/49)

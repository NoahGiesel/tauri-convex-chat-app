# Current project state

_Updated October 30, 2026 — version `0.1.1`, repo `NoahGiesel/tauri-convex-chat-app`._

A private desktop chat (macOS + Windows) for a few friends, at near-zero cost. Right now it is a
**working skeleton with auto-update**: the actual chat (Convex + Better Auth) has not been written yet.

## 1. Chosen stack

| Layer | Choice | Status |
|---|---|---|
| Desktop app | Tauri 2 (Rust) | ✅ configured |
| UI | React 19 + Vite 7 + Tailwind 4 + shadcn/ui (`radix-nova` style, lucide icons) | ✅ configured |
| Package manager | pnpm (lockfile v9) | ✅ |
| Realtime backend | Convex | ⏳ to do |
| Authentication | Better Auth via the Convex component | ⏳ to do |
| Media / video | Cloudflare R2 + Hono Worker for signed URLs | ⏳ to do |
| Local LLM (`/ask`) | llama.cpp as a Tauri sidecar | ⏸ postponed |
| Distribution & updates | GitHub Releases + `tauri-action` | ✅ configured |

## 2. Repo structure

```
src/
  main.tsx                    entry point; wraps the app in <UpdaterProvider>
  App.tsx                     placeholder with Chat / Settings tabs
  hooks/use-updater.tsx       update check/download logic (React context)
  components/
    update-banner.tsx         top bar "New version available"
    settings-updates.tsx      Settings › Updates page
    ui/                       shadcn components: button, card, progress
  lib/utils.ts                `cn` helper
src-tauri/
  tauri.conf.json             app, bundle and updater config (public key + endpoint)
  capabilities/default.json   permissions: core, updater, process:restart, notification
  src/lib.rs                  registers the updater, process and notification plugins
  Cargo.toml / Cargo.lock
  icons/                      generated from app-icon.png with `tauri icon`
.github/workflows/release.yml builds and publishes a release when a `v*` tag is pushed
app-icon.png                  icon source (1024×1024)
```

## 3. Auto-update (the finished part)

**How it works**

1. On startup (after 3 s), every 30 minutes, and when the window regains focus (at most every
   10 minutes), the app asks
   `https://github.com/NoahGiesel/tauri-convex-chat-app/releases/latest/download/latest.json`
   whether a version newer than the installed one exists.
2. If so: a **desktop notification** (once per version, remembered in `localStorage`), a top
   **banner** with "Update now / Details / Later", and a **Settings › Updates** section with
   release notes and a "Download and install" button.
3. Installing downloads the package, verifies its **signature** against the public key in
   `tauri.conf.json`, installs it and restarts the app (on Windows the installer does this itself,
   in `passive` mode).
4. Automatic checks fail silently (offline, no release yet). The manual button shows errors instead.

**How to release**

```bash
pnpm version patch            # bumps package.json (tauri.conf.json reads the version from it) and creates the tag
git push --follow-tags        # CI builds macOS (universal) + Windows and publishes the Release with latest.json
```

**Requirements already met:** public repo; signing key generated; GitHub secrets
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` created; public key and
repo URL set in `tauri.conf.json`.

⚠️ Keep the private key (`~/.tauri/chat.key`) safe: if it is lost, already-installed apps can no
longer update and must be reinstalled by hand.

## 4. Local development

```bash
pnpm install
pnpm tauri dev      # the first Rust compile takes a few minutes
```

Prerequisites: Node 22+, Rust (rustup), Xcode Command Line Tools on macOS.
In `tauri dev` the update check finds nothing: to see it in action you need an installed build of
an older version plus a published newer release.

## 5. Product requirements and progress

| Requirement | Status |
|---|---|
| macOS + Windows | ✅ CI build configured (not yet verified end to end) |
| Updates downloadable from settings, no reinstall | ✅ implemented |
| "Update available" notification | ✅ implemented |
| Desktop notifications (messages) | 🔶 plugin ready, chat missing |
| Realtime chat | ⏳ |
| Auth (Better Auth + Convex) | ⏳ |
| Add friends via link / request | ⏳ |
| Groups | ⏳ |
| Online / offline / last seen status | ⏳ (`@convex-dev/presence` component) |
| "Typing / generating with AI / uploading media" | ⏳ |
| Media and video upload | ⏳ |
| Local LLM with `/ask` | ⏸ postponed |

## 6. Notes and open points

- **Code signing:** binaries are not signed with paid certificates. The first install requires
  bypassing Gatekeeper (macOS: right-click › Open) and SmartScreen (Windows: "Run anyway").
  Later updates go through the updater and do not show the warning again.
- **First release not yet verified:** tags `v0.1.0` and `v0.1.1` exist, but the CI outcome and the
  real update test (install 0.1.0 → release 0.1.1) still need to be checked.
- **README:** the setup commands are written for npm; the project uses pnpm (CI and Tauri hooks
  have already been aligned).
- **`App.tsx`** is a placeholder: the Chat/Settings navigation will be replaced by the real router.
- **Update simulation mode** (dev only) was proposed but not added yet.

## 7. Recommended next steps

1. Verify the full updater cycle on a real installation.
2. Initialize Convex (`pnpm dlx convex dev`) and the Better Auth component; login screen.
3. Convex schema: `users`, `friendships`, `invites`, `groups`, `groupMembers`, `messages`, `presence`,
   with an `assertMember` authorization helper in every query/mutation.
4. Chat UI with shadcn (conversation list, thread, composer), then message notifications.
5. Presence and activity indicators, then media upload to R2.
6. Reintroduce `/ask` with the llama.cpp sidecar.

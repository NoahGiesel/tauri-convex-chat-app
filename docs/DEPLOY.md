# Deploying — read this before releasing

This document is written so that a human or another AI agent can ship a new version of the app
without any other context. **Do not push tags, deploy to production or change secrets unless the
user explicitly asked for it.**

## What gets deployed, and where

| Part | Where it lives | How it ships |
|------|----------------|--------------|
| Backend (`convex/`) | Convex **production** deployment | `npx convex deploy` (manual, from a developer machine) |
| Desktop app (`src/`, `src-tauri/`) | GitHub Releases (macOS universal + Windows) | Push a `v*` tag → `.github/workflows/release.yml` builds a **draft** release; a person publishes it after the Manual smoke |
| Media files (photos/videos) | Cloudflare R2 bucket (private) | Uploaded by clients through presigned URLs created by Convex |
| Auto-update | `latest.json` on the latest **published** GitHub Release | Installed apps check on start, every 30 min and on window focus (not in `tauri dev`). A draft reaches no one |

There are **two Convex deployments**: *dev* (`npx convex dev`, `CONVEX_DEPLOYMENT=dev:…` in `.env.local`)
and *prod* (`--prod`). Release builds must talk to **prod**.

## Release checklist (in this order)

`pnpm e2e` blocks everything that reaches production, and the Manual smoke runs on a draft release,
so a failure never reaches users. The backend goes before the app: a new app version may call
functions or read fields that the old backend does not have, while an old app keeps working against
a newer backend.

```bash
# 0. Checks, on Windows. Both tsc commands must print nothing, and pnpm e2e must pass.
node_modules/.bin/tsc -p tsconfig.json --noEmit
node_modules/.bin/tsc -p convex/tsconfig.json --noEmit
pnpm e2e

# 1. Backend → production Convex. The guard stops if production points ESPN at the E2E stub (ESPN_BASE_URL).
node e2e/backend-guard.mjs
npx convex deploy

# 2. Commit everything, including pnpm-lock.yaml and src-tauri/Cargo.lock (CI uses --frozen-lockfile)
git add -A
git commit -m "<what changed>"
git push

# 3. Bump version + create tag v<version>, then push the tag (this starts the build)
pnpm version patch            # or minor / major
git push --follow-tags

# 4. Watch the build until the draft release is ready
gh run watch

# 5. The Manual smoke, on the app installed from the draft (see below). A person does this step.

# 6. Publish the draft. Only now does latest.json reach installed apps.
gh release edit v<version> --draft=false

# 7. Check that the previous version updates
```

`package.json` is the single source of truth for the version (`src-tauri/tauri.conf.json` reads it).
The tag **must** equal `v<package.json version>`. `pnpm version` requires a clean working tree, so commit first.

- **`pnpm e2e` runs on every release, with no exceptions.** If it fails, there is no deploy and no tag.
- **If the code changes after a run, run it again,** because `pnpm e2e` tests the working tree.
- **It runs on Windows** until the suite is verified on a Mac. Someone releasing from a Mac asks the other dev for the run.
- **During the transition,** a person still tests the whole app by hand on every release, until the
  suite has 10 full green runs in a row. An area stops being tested by hand only once its phase is
  written and trusted (`docs/E2E-SPEC.md`).

### If you are an agent

You may run steps 0 to 4, when the user asked for a release. **Stop before step 5** and hand the
Manual smoke to a person: tell them the draft is ready and give its URL (`gh release view v<version> --web`
or the Releases page). **Run step 6 only when the user asks you to publish.** Step 7 is a person's too.

### Manual smoke

Install the app from the draft's installers. Notifications, the Dock badge and updates only work in
an installed build, never in `tauri dev`. The first install is unsigned: macOS needs right-click → Open,
Windows SmartScreen needs "Run anyway". Later updates do not warn.

**Full Manual smoke,** on the releaser's system:

1. Install, open and sign in.
2. Send a photo through the real file picker.
3. Send a GIF.
4. Send a link and see its preview.
5. Drag a chat into a folder.
6. Drag a tab into a split view.
7. Drag a tab out of the window.
8. Hover a message and see its actions.
9. Play a Wordle Run with the physical keyboard.
10. Get a system notification.
11. See the Dock badge, on macOS.

**Short Manual smoke,** on the other system: install, open, get a system notification, and see the
Dock badge if that system is macOS. A releaser without access to the other system says so in the
release notes.

**Step 7** needs a published release. The smoke replaces the installed version, so step 7 needs the
previous version on the other system, or a reinstall of it. Then wait for the update notification,
or use Settings → Updates → check manually.

### When a step fails

| Failure | What to do |
|---------|------------|
| `pnpm e2e` | Stop. Fix it and run it again. No deploy, no tag |
| Release build (step 4) | Nothing is public. Fix it and redo the release with the same version (below) |
| Manual smoke | Do not publish. Delete the draft and its tag, fix the problem, and redo the release with the same version (below) |
| Updater, after step 6 | The release is public. Ship a new patch |

After a failed Manual smoke the backend stays on production, because an old app keeps working against a
newer backend.

### One-off data migrations
Some releases add data that older documents lack. Run the migration against prod right after
`npx convex deploy`, e.g. `npx convex run library:backfillLinks --prod` (already done once for the
"Media" link list; only needed again for future migrations that say so).

### Redoing a failed release with the same version
Only while the release is still a draft. A published version is never reused: ship a new patch.
```bash
# Delete the draft, if the build made one, and the tag on GitHub
gh release delete v<version> --cleanup-tag --yes
git tag -d v<version>
git push --delete origin v<version>   # only if the tag is still on GitHub
# fix the problem, run pnpm e2e again, commit, push, then:
git tag v<version> && git push origin v<version>
```

## Environment variables and secrets

**Convex environment** (`npx convex env set NAME value [--prod]`; set for dev and prod separately.
Copy dev → prod with `npx convex env list` / `set --prod`):

| Name | Purpose |
|------|---------|
| `BETTER_AUTH_SECRET` | Better Auth signing secret |
| `SITE_URL` | Extra trusted origin for auth (the app origins `tauri://localhost`, `http(s)://tauri.localhost`, `http://localhost:1420` are already hard-coded in `convex/auth.ts`) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2 credentials (token with *Object Read & Write* on that bucket only) |
| `R2_ENDPOINT` | **Never set it on dev or prod.** Only the E2E Test backend sets it, to point R2 at a local stub |
| `R2_JURISDICTION` | **Required when the bucket was created in the EU jurisdiction** (`eu`). Without it uploads fail with a CORS-looking `network/CORS` error |
| `OPENROUTER_API_KEY` | Enables the "Summarize" button (links, YouTube/video files and texts over 10k characters). Model: `google/gemini-3.1-flash-lite` (see `convex/summaryPrompt.ts`). Without it the button shows a "not set up" error |
| `AI_MODEL` | Optional. OpenRouter model used for `/ask` and for all transcriptions. Default `google/gemini-3.1-flash-lite`. YouTube links are sent as URLs, so the model must read them (Gemini does); with another model they may fail |

`CONVEX_SITE_URL` is provided by Convex automatically. Never put the `R2_*` or auth secrets in `.env.local` or in the client.

**`.env.local`** (git-ignored, dev only): `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`,
optional `VITE_GIPHY_API_KEY`.

**GitHub → Settings → Secrets and variables → Actions** (used by the release workflow):

| Secret | Value |
|--------|-------|
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Updater signing key (`npx tauri signer generate`); the matching public key is in `tauri.conf.json` → `plugins.updater.pubkey`. If the private key is lost, installed apps can never update again |
| `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL` | The **production** Convex URLs (`….convex.cloud` / `….convex.site`) — never the dev ones |
| `VITE_GIPHY_API_KEY` | GIPHY key for the GIF picker (baked into the build) |

The repository must stay **public** so the updater can download `latest.json` without authentication.

## Cloudflare R2 setup (once)

1. Create a bucket (note its jurisdiction). Keep **public access off** — reads use signed URLs (valid 24 h, generated in `convex/r2.ts`).
2. Bucket → Settings → CORS policy:
   ```json
   [{
     "AllowedOrigins": ["http://localhost:1420", "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"],
     "AllowedMethods": ["PUT", "GET", "HEAD"],
     "AllowedHeaders": ["*"],
     "MaxAgeSeconds": 3600
   }]
   ```
3. R2 → Manage API tokens → create a token (*Object Read & Write*, this bucket only) and set the `R2_*` variables above on **both** Convex deployments.

## Verifying a release

- GitHub → Actions: the `Release` workflow must be green for macOS and Windows.
- **One** draft release for the tag must hold the installers for both systems and a `latest.json`
  that names both (`gh release view v<version>`). Every URL in `latest.json` must contain `v<version>`,
  not `untagged-`. Check this before the Manual smoke.
- After step 6 the release is no longer a draft and is marked *Latest*: the updater reads
  `releases/latest/download/latest.json`, which never points at a draft. `tauri dev` never finds updates.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Upload error `network/CORS` | Wrong `R2_JURISDICTION` (EU bucket), or CORS policy missing the app origin |
| Upload error `HTTP 403` | Wrong R2 credentials/account id, or token without access to the bucket |
| Images show as broken | Signed URL problem — check `R2_*` on the deployment the app points to |
| App shows another environment's data | Release built with dev `VITE_CONVEX_URL` — fix the GitHub secrets and re-release |
| CI: `ERR_PNPM_OUTDATED_LOCKFILE` | `pnpm-lock.yaml` not committed after a dependency change |
| CI: `tsc` errors | Run both `tsc` commands from step 0 locally; they are the same checks CI runs via `pnpm build` |
| Two drafts for the same tag, each with one system's files | The two builds both made a draft. Delete both on the Releases page, and the tag, then redo the release with the same version |
| Published, but installed apps find no update | The release is still a draft or not marked *Latest*, or `latest.json` is missing from it |
| CI: `Release guard: …` | The build would ship the Test build's WebDriver server or its variables. Remove what it names. Run `node e2e/release-guard.mjs` locally to check, with no tag |
| Notifications missing on macOS | System Settings → Notifications → allow the app (the permission prompt appears only once) |
| Convex types missing (`api.xxx does not exist`) | `npx convex dev` regenerates `convex/_generated/`; run it once after adding backend files |

## Related docs
- `README.md` — first-time setup and updater key generation
- `docs/CURRENT-STATE.md` — stack, structure and open points
- `docs/THEMING.md` — theme system
- `convex/_generated/ai/guidelines.md` — **read before editing Convex code**

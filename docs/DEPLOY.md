# Deploying — read this before releasing

This document is written so that a human or another AI agent can ship a new version of the app
without any other context. **Do not push tags, deploy to production or change secrets unless the
user explicitly asked for it.**

## What gets deployed, and where

| Part | Where it lives | How it ships |
|------|----------------|--------------|
| Backend (`convex/`) | Convex **production** deployment | `npx convex deploy` (manual, from a developer machine) |
| Desktop app (`src/`, `src-tauri/`) | GitHub Releases (macOS universal + Windows) | Push a `v*` tag → `.github/workflows/release.yml` builds and publishes |
| Media files (photos/videos) | Cloudflare R2 bucket (private) | Uploaded by clients through presigned URLs created by Convex |
| Auto-update | `latest.json` on the latest GitHub Release | Installed apps check on start, every 30 min and on window focus (not in `tauri dev`) |

There are **two Convex deployments**: *dev* (`npx convex dev`, `CONVEX_DEPLOYMENT=dev:…` in `.env.local`)
and *prod* (`--prod`). Release builds must talk to **prod**.

## Release checklist (in this order)

The backend goes first: a new app version may call functions or read fields that the old backend
does not have, while an old app keeps working against a newer backend.

```bash
# 0. Sanity checks (both must print nothing)
node_modules/.bin/tsc -p tsconfig.json --noEmit
node_modules/.bin/tsc -p convex/tsconfig.json --noEmit

# 1. Backend → production Convex
npx convex deploy

# 2. Commit everything, including pnpm-lock.yaml and src-tauri/Cargo.lock (CI uses --frozen-lockfile)
git add -A
git commit -m "<what changed>"
git push

# 3. Bump version + create tag v<version>, then push the tag (this starts the build)
pnpm version patch            # or minor / major
git push --follow-tags

# 4. Watch the build
gh run watch
```

`package.json` is the single source of truth for the version (`src-tauri/tauri.conf.json` reads it).
The tag **must** equal `v<package.json version>`. `pnpm version` requires a clean working tree, so commit first.

### One-off data migrations
Some releases add data that older documents lack. Run the migration against prod right after
`npx convex deploy`, e.g. `npx convex run library:backfillLinks --prod` (already done once for the
"Media" link list; only needed again for future migrations that say so).

### Redoing a failed release with the same version
```bash
git tag -d v<version> && git push --delete origin v<version>
# fix the problem, commit, push, then:
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
| `R2_JURISDICTION` | **Required when the bucket was created in the EU jurisdiction** (`eu`). Without it uploads fail with a CORS-looking `network/CORS` error |

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

- GitHub → Actions: the `Release` workflow must be green for macOS and Windows; the Release must contain installers and `latest.json`.
- Install the previous version, wait for the update notification (or Settings → Updates → check manually). `tauri dev` never finds updates.
- Notifications, the Dock badge and updates only work in an installed build, not in `tauri dev` on macOS.
- First install is unsigned: macOS needs right-click → Open, Windows SmartScreen "Run anyway". Later updates don't warn.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Upload error `network/CORS` | Wrong `R2_JURISDICTION` (EU bucket), or CORS policy missing the app origin |
| Upload error `HTTP 403` | Wrong R2 credentials/account id, or token without access to the bucket |
| Images show as broken | Signed URL problem — check `R2_*` on the deployment the app points to |
| App shows another environment's data | Release built with dev `VITE_CONVEX_URL` — fix the GitHub secrets and re-release |
| CI: `ERR_PNPM_OUTDATED_LOCKFILE` | `pnpm-lock.yaml` not committed after a dependency change |
| CI: `tsc` errors | Run both `tsc` commands from step 0 locally; they are the same checks CI runs via `pnpm build` |
| Notifications missing on macOS | System Settings → Notifications → allow the app (the permission prompt appears only once) |
| Convex types missing (`api.xxx does not exist`) | `npx convex dev` regenerates `convex/_generated/`; run it once after adding backend files |

## Related docs
- `README.md` — first-time setup and updater key generation
- `docs/CURRENT-STATE.md` — stack, structure and open points
- `docs/THEMING.md` — theme system
- `convex/_generated/ai/guidelines.md` — **read before editing Convex code**

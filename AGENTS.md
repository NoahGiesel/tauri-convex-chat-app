<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Deploying / releasing

Read `docs/DEPLOY.md` before any deploy or release. Never push tags, run `npx convex deploy` or change secrets unless the user explicitly asks.

## Release notes

For every user-visible change (feature, fix, UI or text change), add a line to the `"next"` entry of `src/data/release-notes.ts` in the same piece of work, in English and Italian. When a release is made, rename `"next"` to the version number and start a new `"next"` entry. Do not list purely internal changes (tests, refactors).

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Subagents under herdr

When `$HC_TERMINAL_ID` is set, run each subagent a skill asks for (implementer, merger, explorer, reviewer, researcher) as a Claude Code worker in hc, following `docs/agents/herdr-subagents.md`. A session whose task file has a "Worker rules" section is itself a worker: it does its task alone.

## Deploying / releasing

Read `docs/DEPLOY.md` before any deploy or release. Never push tags, run `npx convex deploy` or change secrets unless the user explicitly asks.

## Release notes

`src/data/release-notes.ts` lists, per version, only the user-visible changes (feature, fix, UI or text change) of that version, in English and Italian. The `"next"` entry holds only what is NOT in the latest release yet.

To fill or check `"next"`, diff against the latest release tag (`git describe --tags --abbrev=0`, then `git diff <tag> --stat` and `git grep` on the tag for each candidate item) and list only what is new compared to that tag. Never carry over an item already shipped in an earlier version. At release time rename `"next"` to the version number and start a new `"next"`. Do not list purely internal changes (tests, refactors).

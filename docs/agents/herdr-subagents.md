# Subagents as herdr workers

Applies when `$HC_TERMINAL_ID` is set and a skill asks for a subagent: the implementer, merger and exploration subagents of `implement-spec`, the Standards and Spec sub-agents of `code-review`, the research subagents of `wayfinder`. Each one runs as a **worker**: an interactive Claude Code session in an hc terminal, shown as its own tab in your herdr space, so the user can watch it and step in. You are the **lead**.

The calling skill still decides what each worker does and when. This doc only replaces the Agent tool: how a worker is launched, waited on, merged and cleaned up. Commands are for the Bash tool (Git Bash). For anything about hc beyond these steps, run `hc --skill`.

## 1. Write the task

Write the worker's prompt, exactly what the calling skill says to give its subagent, to `$root/.hc/tasks/<worker>.md`, where `root=$(git rev-parse --show-toplevel)` (the main checkout, even when the worker runs in a worktree; `.hc/` is gitignored). Name workers by role and ticket: `impl-131`, `merge-131`, `explore-spec`, `review-standards`, `review-spec`, `research-129` (1-32 chars of `a-z 0-9 - _`). End every task file with this footer, filled in:

```markdown
## Worker rules

- You are a worker for the lead at hc address <lead $HC_TERMINAL_ID>. Do the work in this session; start no agents or subagents.
- Commit only if the task above says to, and only on your own branch.
- Write your full result to <root>/.hc/reports/<worker>.md. Then send its path with a two-line summary: hc send <lead> "<path>: <summary>". Report the same way when you are stuck or need a decision.
```

## 2. Pick the folder

- A worker that commits (implementer, research) gets its own worktree: `git worktree add .claude/worktrees/<worker> -b <branch> <base>`. Implementers branch `<worker>` off the integration branch; research workers branch `research/<name>` off `master`. Add `pnpm install --frozen-lockfile` as the task's first step: worktrees have no `node_modules`. `.claude/worktrees/` is git-excluded.
- A read-only worker (reviewer, explorer) runs in `$root`. Explorers save notes under `$root/.hc/notes/`.

## 3. Launch

```sh
scripts/hc-worker.sh <worker> <folder>                  # reviewer, explorer, researcher
scripts/hc-worker.sh <worker> <folder> --model sonnet   # implementer, merger, review fix-up
```

Workers that write code run on Sonnet, the user's choice for implementation; the others keep the user's default model.

It starts `claude --permission-mode auto` on the task file and splits the worker into your tab, where the user wants to watch it: the first worker to the right of your pane, each later one stacked below the previous one, the column kept in equal heights. It prints `<worker>: <address>`. The task rides in claude's argv, so it is the session's first message: no `hc send` to a booting agent. Use this argv form: hc templates break on Windows (0.1.19 runs them through `sh`). Launch every worker the skill runs in parallel back to back, then wait. Done when each `run` returns an address.

## 4. Wait

```sh
hc wait --children any --json --timeout 100
```

Keep `--timeout` under the Bash tool's 120 s limit. When the skill waits for all of them (code-review's two reviewers), use `--children all`. Act on `reason`:

- `message`: the worker's report arrives as your next input, tagged `<hc from="tN <worker>">`. It is a worker report, not the user. Read the report file it names before acting on it. Answer a question with `hc send <worker> "..."`.
- `timeout`: a check-in. Do other lead work if there is any, then wait again.
- `status` `blocked` or `error`: read the screen with `hc read <worker> --lines 0`. A permission prompt or a question for a human goes to the user, who can also answer in the worker's tab.
- exited: read its output with `hc read <worker> --lines 100`.

Done when every worker the step needs has reported and you have read each report file.

## 5. Merge (implement-spec)

Merge a finished implementer yourself, on the integration branch in `$root`: `git merge --no-ff <worker>`. A clean merge needs no merger. On a conflict, run `git merge --abort` and launch a `merge-<n>` worker in `$root` whose task is to merge `<worker>` into the integration branch and resolve the conflicts.

## 6. Clean up

Once you accept a worker's result: `hc kill <worker>; hc rm <worker>`. After a worktree branch is merged (or a research branch pushed): `git worktree remove .claude/worktrees/<worker>`, then `git branch -d <branch>` for merged implementer branches. Delete its `.hc/tasks/` file. Done when `hc ls` and `git worktree list` show none of your workers.

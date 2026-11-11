#!/usr/bin/env bash
# Starts a Claude Code (or OpenCode) worker for the lead terminal ($HC_TERMINAL_ID) and shows it in the lead's
# herdr tab: the first worker splits right of the lead's pane, later ones stack below the last pane of that column.
# The task is read from <repo>/.hc/tasks/<worker>.md (see docs/agents/herdr-subagents.md).
# Usage: scripts/hc-worker.sh <worker> <folder> [extra claude options, e.g. --model haiku]
#        scripts/hc-worker.sh <worker> <folder> --opencode [<provider/model>, e.g. opencode/claude-sonnet-5-5]
set -euo pipefail

worker=$1 folder=$2
shift 2
root=$(git rev-parse --show-toplevel)
task="$root/.hc/tasks/$worker.md"
[ -f "$task" ] || { echo "missing task file $task" >&2; exit 1; }

# Windows jq ends lines with \r; strip it from every id we pass back to hc or herdr-app.
tabpanes() {
  herdr-app ls | jq -r --arg t "$HC_TERMINAL_ID" \
    '.spaces[].tabs[] | select(any(.terminals[]; .terminal == $t)) | .terminals[] | "\(.terminal) \(.pane)"' | tr -d '\r'
}

if [ "${1:-}" = --opencode ]; then
  # The OpenCode TUI has no --model flag and hc passes no environment, so PowerShell sets OPENCODE_CONFIG to a
  # per-worker config naming the model. --standalone makes OpenCode read it: the shared service ignores it.
  setcfg=
  if [ -n "${2:-}" ]; then
    cfg="$root/.hc/tasks/$worker.opencode.json"
    printf '{"model":"%s"}\n' "$2" > "$cfg"
    setcfg="\$env:OPENCODE_CONFIG='$cfg'; "
  fi
  cmd=(powershell -NoProfile -Command "${setcfg}opencode --standalone --auto --prompt 'Read $task and do it.'")
else
  # Trust the worker's folder up front: Claude Code asks per folder (a trusted repo doesn't cover its worktrees),
  # and that prompt would block the worker before it reads its task.
  dir=$(cd "$folder" && { pwd -W 2>/dev/null || pwd; })
  node -e '
    const fs = require("fs"), f = require("os").homedir() + "/.claude.json";
    const j = JSON.parse(fs.readFileSync(f, "utf8")), p = (j.projects ??= {});
    const e = (p[process.argv[1]] ??= {});
    if (!e.hasTrustDialogAccepted) {
      e.hasTrustDialogAccepted = true;
      fs.writeFileSync(f + ".tmp", JSON.stringify(j, null, 2));
      fs.renameSync(f + ".tmp", f);
    }' "$dir"
  cmd=(claude --permission-mode auto -n "$worker" "$@" "Read $task and do it.")
fi

# No herdr labels: the worker starts as a pane-less sub-agent of the lead, then gets its pane below.
addr=$(hc run --bg --json --name "$worker" --cwd "$folder" -- "${cmd[@]}" | jq -r .address | tr -d '\r')

main=$(tabpanes | awk -v t="$HC_TERMINAL_ID" '$1 == t { print $2 }')
last=$(tabpanes | awk -v t="$HC_TERMINAL_ID" '$1 != t { p = $2 } END { print p }')
if [ -z "$last" ]; then target=$main place=right; else target=$last place=down; fi

# The window learns about a new terminal a moment after hc starts it; until then keep answers "no running terminal".
for _ in $(seq 25); do
  herdr-app do pane.focus --pane "$target" >/dev/null
  out=$(herdr-app do terminal.keep --terminal "$addr" --place "$place" || true)
  case $out in *'"error"'*) sleep 0.2 ;; *) break ;; esac
done
case $out in *'"error"'*) echo "$worker ($addr) runs, but got no pane: $out" >&2; exit 1 ;; esac

# keep is applied asynchronously: wait until the pane is listed, so the next launch stacks below it.
for _ in $(seq 20); do tabpanes | grep -q "^$addr " && break; sleep 0.2; done

# Each down split halves the pane it splits; equal weights make the worker column symmetric. With one worker
# there is no column yet, and its weight is its share beside the lead's pane, so it is left alone.
workers=$(tabpanes | awk -v t="$HC_TERMINAL_ID" '$1 != t { print $2 }')
if [ "$(echo "$workers" | wc -l)" -ge 2 ]; then
  for p in $workers; do herdr-app do layout.resize --id "$p" --weight 1 >/dev/null; done
fi
herdr-app do pane.focus --pane "$main" >/dev/null
echo "$worker: $addr"

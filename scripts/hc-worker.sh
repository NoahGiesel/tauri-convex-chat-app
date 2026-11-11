#!/usr/bin/env bash
# Starts a Claude Code worker for the lead terminal ($HC_TERMINAL_ID) and shows it in the lead's herdr tab:
# the first worker splits right of the lead's pane, later ones stack below the last pane of that column.
# The task is read from <repo>/.hc/tasks/<worker>.md (see docs/agents/herdr-subagents.md).
# Usage: scripts/hc-worker.sh <worker> <folder> [extra claude options, e.g. --model haiku]
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

# No herdr labels: the worker starts as a pane-less sub-agent of the lead, then gets its pane below.
addr=$(hc run --bg --json --name "$worker" --cwd "$folder" -- \
  claude --permission-mode auto -n "$worker" "$@" "Read $task and do it." | jq -r .address | tr -d '\r')

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

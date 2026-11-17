#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION="opi-stress-bench"

for command in tmux htop iostat; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    echo "Install tmux, htop, and sysstat first." >&2
    exit 1
  fi
done

if tmux has-session -t "$SESSION" 2>/dev/null; then
  exec tmux attach-session -t "$SESSION"
fi

tmux new-session -d -s "$SESSION" -n monitor -c "$ROOT"
tmux split-window -h -t "$SESSION:0" -c "$ROOT" -p 35
tmux split-window -v -t "$SESSION:0.1" -c "$ROOT" -p 45
tmux send-keys -t "$SESSION:0.1" 'htop' C-m
tmux send-keys -t "$SESSION:0.2" 'iostat -xz 1' C-m
tmux select-pane -t "$SESSION:0.0"
exec tmux attach-session -t "$SESSION"

#!/bin/bash
# Double-click this file to start the Pilot Logbook and open it in your browser.
# Leave the Terminal window open while you use it; press Ctrl-C (or close the
# window) to stop the server.

PORT=3000
URL="http://localhost:$PORT"

# Work from the folder this script lives in, following an alias/symlink if the
# script was launched from one, so the file can be moved or linked anywhere.
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
PROJECT="$(cd -P "$(dirname "$SOURCE")" && pwd)"
cd "$PROJECT" || { echo "Can't find the logbook folder."; read -r; exit 1; }

# This Mac's system Node is far too old, so use the user-local Node 22 install.
NODE_BIN="$HOME/.local/node-v22.23.2-darwin-x64/bin"
[ -d "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"

printf '\033]0;Pilot Logbook\007'   # name the Terminal window
echo "✈  Pilot Logbook"
echo "   $PROJECT"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "✕  Node isn't available."
  echo "   Expected it at: $NODE_BIN"
  echo "   Reinstall Node 22 there, or edit NODE_BIN near the top of this file."
  echo
  echo "Press Return to close."
  read -r
  exit 1
fi

# Already running (perhaps from an earlier launch)? Just open the browser.
if curl -s -o /dev/null --max-time 2 "$URL"; then
  echo "Already running — opening $URL"
  open "$URL"
  exit 0
fi

echo "Starting the server… (first launch takes a few seconds to compile)"

# Deliberately NOT using job control here: leaving the server in this script's
# process group means Ctrl-C in Terminal reaches the whole tree at once. The
# trap below covers the other exits (window closed, SIGTERM).
npm run dev &
SERVER_PID=$!

# `npm run dev` spawns Next, which spawns the server process, so stopping means
# walking the tree — killing npm alone would orphan whatever is holding the port.
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null
}

cleanup() {
  trap - EXIT INT TERM HUP
  echo
  echo "Stopping Pilot Logbook…"
  kill_tree "$SERVER_PID"
  for _ in 1 2 3 4 5; do
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 1
  done
  kill -KILL "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  echo "Stopped."
}
trap cleanup EXIT INT TERM HUP

# Wait for it to answer before opening the browser, so you don't land on an error.
for _ in $(seq 1 90); do
  if curl -s -o /dev/null --max-time 1 "$URL"; then
    OPENED=1
    break
  fi
  # Bail out early if the server died on startup.
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo
    echo "✕  The server stopped while starting up — see the messages above."
    echo "Press Return to close."
    read -r
    exit 1
  fi
  sleep 1
done

if [ -n "${OPENED:-}" ]; then
  echo
  echo "✓  Opening $URL"
  echo "   Keep this window open. Press Ctrl-C here to stop."
  open "$URL"
else
  echo "✕  The server didn't respond on port $PORT in time."
fi

wait "$SERVER_PID"

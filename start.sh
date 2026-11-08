#!/usr/bin/env bash
# start.sh — the whole product, one command.
#
#   ./start.sh      then open http://localhost:3000
#
# Two processes behind one URL:
#   :8000  the molecule design loop (Python)   — proxied, not opened directly
#   :3000  bioREACT bioprocess app (Node)      — the front door
set -uo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:$PATH"

# Use the interpreter that actually has rdkit. Homebrew's python3 comes
# first on PATH once Node is installed, and it does not.
PY_BIN="${PY_BIN:-$HOME/anaconda3/bin/python3}"
command -v "$PY_BIN" >/dev/null || PY_BIN=python3

CLEANED=0
cleanup() {
  [ "$CLEANED" = 1 ] && return; CLEANED=1
  echo; echo "stopping..."; kill 0 2>/dev/null
}
trap cleanup EXIT INT TERM

# Free the ports first. Re-running this script is the normal case, and an
# old server still holding :3000 or :8000 would otherwise crash both.
for port in 8000 3000; do
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "      port $port in use - stopping the old process"
    kill $pids 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  fi
done

if ! command -v node >/dev/null; then
  echo "Node is not installed.  brew install node"; exit 1
fi

echo "[1/2] design loop  -> http://localhost:8000  (proxied at /design)"
( cd loop && "$PY_BIN" serve.py ) &

if [ ! -d bioreact-app/node_modules ]; then
  echo "      installing bioreact-app dependencies (first run only)..."
  ( cd bioreact-app && npm install --silent )
fi

echo "[2/2] bioREACT app -> http://localhost:3000   <-- OPEN THIS"
( cd bioreact-app && npm run dev )

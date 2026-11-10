#!/usr/bin/env bash
# start.sh — the whole thing, one command.
#
#   ./start.sh      then open http://localhost:3000
#
# Two processes behind one address:
#   :8000  the design and manufacturability API (Python: RDKit, Vina, agents)
#   :3000  the interface (Node) — the front door, and it proxies :8000
#
# Ctrl-C stops both. Re-running this script is safe: it frees both ports
# first, which is the normal case when a previous run is still up.
set -uo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:$PATH"

# Use an interpreter that actually has RDKit. Homebrew's python3 comes first
# on PATH once Node is installed, and it does not have it.
PY_BIN="${PY_BIN:-}"
if [ -z "$PY_BIN" ]; then
  for candidate in "$HOME/anaconda3/bin/python3" "$HOME/miniconda3/bin/python3" python3; do
    if command -v "$candidate" >/dev/null 2>&1 &&
       "$candidate" -c "import rdkit" >/dev/null 2>&1; then
      PY_BIN="$candidate"
      break
    fi
  done
fi
if [ -z "$PY_BIN" ]; then
  echo "No Python with RDKit found."
  echo "  pip install -r loop/requirements.txt"
  echo "  then re-run, or set PY_BIN=/path/to/python3"
  exit 1
fi

CLEANED=0
cleanup() {
  [ "$CLEANED" = 1 ] && return
  CLEANED=1
  echo
  echo "stopping..."
  kill 0 2>/dev/null
}
trap cleanup EXIT INT TERM

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
  echo "Node is not installed.  brew install node"
  exit 1
fi

echo "[1/2] design API -> http://localhost:8000  (proxied; nothing to open)"
( cd loop && "$PY_BIN" serve.py ) &

if [ ! -x bioreact-app/node_modules/.bin/tsx ]; then
  echo "      installing interface dependencies (first run only)..."
  if ! ( cd bioreact-app && npm install --no-audit --no-fund ); then
    echo "npm install failed - see the error above"
    exit 1
  fi
fi

echo "[2/2] interface  -> http://localhost:3000   <-- OPEN THIS"
( cd bioreact-app && npm run dev )

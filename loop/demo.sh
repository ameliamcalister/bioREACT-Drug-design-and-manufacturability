#!/usr/bin/env bash
# demo.sh — one command for the pitch. Rehearse with this exact script.
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-live}"

case "$MODE" in
  live)   ARGS="--warm-start" ;;
  cache)  ARGS="--warm-start --cache-only" ;;        # instant, pre-computed poses
  mock)   ARGS="--warm-start --cache-only --mock" ;; # no API key, no network
  *) echo "usage: ./demo.sh [live|cache|mock]"; exit 1 ;;
esac

echo "=== CRITIC EVALUATION ==========================================="
python3 eval_set.py
echo
echo "=== CLOSED LOOP ($MODE) ========================================="
python3 orchestrator.py $ARGS
echo
echo "UI: python3 serve.py  ->  http://localhost:8000"

#!/usr/bin/env bash
# Vigile — lancement local (macOS / Linux).
set -euo pipefail
cd "$(dirname "$0")"
python3 server.py 8131 &
sleep 2
( xdg-open http://127.0.0.1:8131/ >/dev/null 2>&1 || open http://127.0.0.1:8131/ >/dev/null 2>&1 || true )
echo "Vigile tourne sur http://127.0.0.1:8131/ — Ctrl+C pour arrêter."
wait

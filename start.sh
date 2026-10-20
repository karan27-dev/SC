#!/usr/bin/env bash
# Starts the API (port 8000) and the web app (port 5180) together.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
PY="$(command -v python3.13 || command -v python3)"
[ -d .venv ] || { "$PY" -m venv .venv && .venv/bin/pip install -r requirements.txt; }
.venv/bin/uvicorn app.main:app --port 8000 --reload --reload-dir app &
API=$!
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
trap "kill $API" EXIT
npx vite --port 5180

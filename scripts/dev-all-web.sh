#!/usr/bin/env bash
# AsanPay — start ALL local web apps + API (Mac Terminal)
# Usage:
#   bash scripts/dev-all-web.sh
#   npm run dev:webs
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"

cd "$ROOT"

PORTS=(4000 3000 3001 3002)
PIDS=()

cleanup() {
  echo ""
  echo "==> Stopping web stacks..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Also clear anything still bound to our ports
  for port in "${PORTS[@]}"; do
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
  done
  echo "==> Done."
}
trap cleanup EXIT INT TERM

echo "==> Project: $ROOT"
echo "==> Freeing ports: ${PORTS[*]}"
for port in "${PORTS[@]}"; do
  lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
done
sleep 0.5

start_one() {
  local name="$1"
  local cmd="$2"
  local log="$LOG_DIR/$name.log"
  echo "==> Starting $name …  (log: $log)"
  # shellcheck disable=SC2086
  nohup bash -lc "$cmd" >"$log" 2>&1 &
  PIDS+=($!)
}

start_one "backend"    "npm run dev:backend"
start_one "admin-web"  "npm run dev:admin"
start_one "agent-web"  "npm run dev:web"
start_one "frontend"   "npm run dev:frontend"

echo ""
echo "==> Waiting for services…"

wait_http() {
  local url="$1"
  local label="$2"
  local i=0
  while [ $i -lt 60 ]; do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "    ✓ $label"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "    ✗ $label (timeout — check $LOG_DIR)"
  return 1
}

wait_http "http://localhost:4000/health" "Backend   :4000"
wait_http "http://localhost:3000/login"  "Admin     :3000"
wait_http "http://localhost:3001/login"  "Agent Web :3001"
wait_http "http://localhost:3002"        "Frontend  :3002"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AsanPay — all webs running"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Frontend (marketing)  http://localhost:3002"
echo "  Admin login           http://localhost:3000/login"
echo "  Agent Web login       http://localhost:3001/login"
echo "  Agent Signup          http://localhost:3001/signup"
echo "  Backend health        http://localhost:4000/health"
echo ""
echo "  Admin:  9999999999 / ChangeMe123"
echo "  Super:  9111111111 / MdPass123"
echo ""
echo "  Logs → $LOG_DIR/"
echo "  Stop → Ctrl+C"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Keep script alive so Ctrl+C cleans up children
wait

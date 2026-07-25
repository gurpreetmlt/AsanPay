#!/usr/bin/env bash
# AsanPay — ONE command: Backend + Admin + Agent Web + Frontend
# Usage:  bash scripts/dev-web.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"
cd "$ROOT"

PORTS=(4000 3000 3001 3002)
PIDS=()

cleanup() {
  echo ""
  echo "==> Stopping all services..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  for port in "${PORTS[@]}"; do
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
  done
  echo "==> Done."
}
trap cleanup EXIT INT TERM

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AsanPay — Web Dev (single command)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

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
  nohup bash -lc "cd '$ROOT' && $cmd" >"$log" 2>&1 &
  PIDS+=($!)
}

start_one "backend"    "npm run dev -w @asanpay/backend"
start_one "admin-web"  "npm run dev -w @asanpay/admin-web"
start_one "agent-web"  "npm run dev -w @asanpay/web"
start_one "frontend"   "npm run dev -w @asanpay/frontend"

echo ""
echo "==> Waiting for services to start..."

wait_http() {
  local url="$1" label="$2" i=0
  while [ $i -lt 60 ]; do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "    ✓ $label"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "    ✗ $label (timeout — check $LOG_DIR/$3.log)"
  return 1
}

wait_http "http://localhost:4000/health" "Backend   :4000" "backend"
wait_http "http://localhost:3000"        "Admin     :3000" "admin-web"
wait_http "http://localhost:3001"        "Agent Web :3001" "agent-web"
wait_http "http://localhost:3002"        "Frontend  :3002" "frontend"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ALL RUNNING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backend API        http://localhost:4000"
echo "  Admin Panel        http://localhost:3000/login"
echo "  Agent Web          http://localhost:3001/login"
echo "  Marketing Site     http://localhost:3002"
echo ""
echo "  Logs → $LOG_DIR/"
echo "  Stop → Ctrl+C"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

wait

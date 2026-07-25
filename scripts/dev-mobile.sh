#!/usr/bin/env bash
# AsanPay — ONE command: Backend + Metro + ADB reverse + Android install
# Usage:  bash scripts/dev-mobile.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/asanpay-mobile-app"
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"
cd "$ROOT"

PIDS=()

cleanup() {
  echo ""
  echo "==> Stopping all services..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  lsof -ti:4000 | xargs kill -9 2>/dev/null || true
  lsof -ti:8081 | xargs kill -9 2>/dev/null || true
  echo "==> Done."
}
trap cleanup EXIT INT TERM

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AsanPay — Mobile Dev (single command)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Kill stale processes ──────────────────────
echo "==> Freeing ports 4000, 8081..."
lsof -ti:4000 | xargs kill -9 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true
sleep 0.5

# ── 2. Clear Metro cache ────────────────────────
echo "==> Clearing Metro cache..."
rm -rf "$MOBILE/node_modules/.cache/metro" 2>/dev/null || true
rm -f /tmp/metro-* /tmp/haste-map-* 2>/dev/null || true
watchman watch-del-all 2>/dev/null || true

# ── 3. Check device ─────────────────────────────
echo "==> Checking USB device..."
if ! adb devices | grep -q "device$"; then
  echo "    ✗ No Android device found. Connect phone via USB and enable USB debugging."
  exit 1
fi
echo "    ✓ Device connected"

# ── 4. ADB reverse (phone → Mac) ────────────────
echo "==> ADB reverse ports..."
adb reverse tcp:8081 tcp:8081 || true
adb reverse tcp:4000 tcp:4000 || true
echo "    ✓ 8081 (Metro) + 4000 (Backend) reversed"

# ── 5. Start Backend ────────────────────────────
echo "==> Starting Backend :4000..."
nohup bash -lc "cd '$ROOT' && npm run dev -w @asanpay/backend" >"$LOG_DIR/backend.log" 2>&1 &
PIDS+=($!)

# Wait for backend
i=0
while [ $i -lt 30 ]; do
  if curl -sf "http://localhost:4000/health" >/dev/null 2>&1; then
    echo "    ✓ Backend ready"
    break
  fi
  i=$((i + 1))
  sleep 1
done
if [ $i -ge 30 ]; then
  echo "    ⚠ Backend slow to start (check $LOG_DIR/backend.log) — continuing..."
fi

# ── 6. Start Metro ──────────────────────────────
echo "==> Starting Metro bundler..."
export CI=true
export RCT_METRO_PORT=8081
cd "$MOBILE"
node_modules/.bin/react-native start --reset-cache >"$LOG_DIR/metro.log" 2>&1 &
PIDS+=($!)

i=0
while [ $i -lt 30 ]; do
  if curl -sf "http://localhost:8081/status" >/dev/null 2>&1; then
    echo "    ✓ Metro ready"
    break
  fi
  i=$((i + 1))
  sleep 2
done
if [ $i -ge 30 ]; then
  echo "    ⚠ Metro slow to start (check $LOG_DIR/metro.log) — continuing..."
fi

# ── 7. Gradle clean + install ───────────────────
echo "==> Cleaning Gradle..."
rm -rf "$MOBILE/android/build/generated/autolinking" 2>/dev/null || true
(cd "$MOBILE/android" && ./gradlew clean -q) 2>/dev/null || true

echo "==> Installing APK on device..."
node_modules/.bin/react-native run-android --no-packager --active-arch-only

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MOBILE APP RUNNING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backend API    http://localhost:4000"
echo "  Metro bundler  http://localhost:8081"
echo "  ADB reverse    8081 + 4000 → phone"
echo ""
echo "  Logs → $LOG_DIR/"
echo "  Stop → Ctrl+C"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$ROOT"
wait

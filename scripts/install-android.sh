#!/usr/bin/env bash
# AsanPay — Android install (run in Mac Terminal, not Cursor)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/asanpay-mobile-app"

echo "==> Project: $ROOT"
cd "$ROOT"

echo "==> Link mobile native deps..."
npm run postinstall -w @asanpay/mobile --if-present 2>/dev/null || \
  bash "$MOBILE/scripts/link-navigation.sh"

echo "==> Regenerate launcher icons (no white border)..."
python3 "$ROOT/scripts/generate-app-icons.py" 2>/dev/null || true

echo "==> Clear stale Gradle autolinking cache..."
rm -rf "$MOBILE/android/build/generated/autolinking"
rm -rf "$MOBILE/android/app/build"
rm -rf "$MOBILE/android/.gradle"

echo "==> Gradle clean..."
(cd "$MOBILE/android" && ./gradlew clean -q) || true

echo "==> Check device..."
adb devices

echo "==> ADB reverse port (phone → Mac Metro)..."
adb reverse tcp:8081 tcp:8081 || true
adb reverse tcp:4000 tcp:4000 || true

export CI=true
export RCT_METRO_PORT=8081

echo "==> Stop stale Metro + clear cache..."
lsof -ti:8081 | xargs kill -9 2>/dev/null || true
rm -rf "$MOBILE/node_modules/.cache/metro" 2>/dev/null || true
rm -rf /tmp/metro-* /tmp/haste-map-* 2>/dev/null || true
watchman watch-del-all 2>/dev/null || true

echo "==> Start Metro (background) + install..."
cd "$MOBILE"
node_modules/.bin/react-native start --reset-cache &
METRO_PID=$!
trap 'kill $METRO_PID 2>/dev/null || true' EXIT

# Wait for bundler
for i in $(seq 1 30); do
  if curl -sf "http://localhost:8081/status" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

node_modules/.bin/react-native run-android --no-packager --active-arch-only

echo ""
echo "Done. AsanPay should be on your phone."

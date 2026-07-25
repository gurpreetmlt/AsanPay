#!/usr/bin/env bash
# Kill stale Metro and start fresh from AsanPay
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/asanpay-mobile-app"

echo "==> Project: $ROOT"
echo "==> Stopping ALL Metro / packager on 8081–8083..."
for port in 8081 8082 8083; do
  lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
done
pkill -f "react-native start" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true

echo "==> Clearing Metro / Watchman / temp caches..."
rm -rf "$MOBILE/node_modules/.cache" 2>/dev/null || true
rm -rf /tmp/metro-* /tmp/haste-map-* 2>/dev/null || true
rm -rf "${TMPDIR:-/tmp}"/metro-* "${TMPDIR:-/tmp}"/haste-map-* 2>/dev/null || true
watchman watch-del-all 2>/dev/null || true

echo "==> Starting Metro (reset-cache) from: $MOBILE"
cd "$MOBILE"
export CI=true
exec npx react-native start --reset-cache

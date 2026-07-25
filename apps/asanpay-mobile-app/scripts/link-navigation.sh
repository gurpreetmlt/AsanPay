#!/bin/bash
# Mobile monorepo fixes: local copies so Metro resolves correctly
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
NAV="$MOBILE/node_modules/@react-navigation"
SRC="$ROOT/node_modules/@react-navigation"

mkdir -p "$NAV" "$MOBILE/node_modules"
for pkg in core native elements routers bottom-tabs; do
  if [ -d "$SRC/$pkg" ]; then
    rm -rf "$NAV/$pkg"
    cp -R "$SRC/$pkg" "$NAV/$pkg"
  fi
done

# Zustand must use mobile's React 18, not root React 19
if [ -d "$ROOT/node_modules/zustand" ] && [ ! -d "$MOBILE/node_modules/zustand" ]; then
  cp -R "$ROOT/node_modules/zustand" "$MOBILE/node_modules/zustand"
fi

# Never resolve RN UI libs from root (duplicate native view registration)
for pkg in react-native-safe-area-context react-native-screens react-native-linear-gradient react-native-svg lucide-react-native @react-native-async-storage/async-storage; do
  if [ -d "$MOBILE/node_modules/$pkg" ]; then
    continue
  fi
  if [ -d "$ROOT/node_modules/$pkg" ]; then
    mkdir -p "$(dirname "$MOBILE/node_modules/$pkg")"
    cp -R "$ROOT/node_modules/$pkg" "$MOBILE/node_modules/$pkg"
  fi
done

#!/usr/bin/env bash
#
# Sync service icons: web public (canonical) → mobile assets + serviceIconXml.ts
#
# Canonical location (put new SVGs here):
#   apps/agent-portal/public/service-icons/
#
# Run: bash scripts/sync-icons.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/apps/agent-portal/public/service-icons"
MOBILE_SVG="$ROOT/apps/asanpay-mobile-app/src/assets/service-icons"
MOBILE_XML="$ROOT/apps/asanpay-mobile-app/src/assets/serviceIconXml.ts"

if [ ! -d "$SOURCE" ]; then
  echo "ERROR: canonical icon folder not found at $SOURCE"
  exit 1
fi

COUNT=$(ls -1 "$SOURCE"/*.svg 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" = "0" ]; then
  echo "ERROR: no .svg files in $SOURCE"
  exit 1
fi

echo "Found $COUNT SVGs in apps/agent-portal/public/service-icons/ (canonical)"

echo "→ Syncing to mobile assets/service-icons..."
mkdir -p "$MOBILE_SVG"
# Replace mobile copies so deleted web icons disappear too
find "$MOBILE_SVG" -type f \( -name '*.svg' -o -name '*.png' \) -delete 2>/dev/null || true
cp "$SOURCE"/*.svg "$MOBILE_SVG/"
# Optional PNGs if any land in public later
if ls "$SOURCE"/*.png >/dev/null 2>&1; then
  cp "$SOURCE"/*.png "$MOBILE_SVG/"
fi
echo "  ✓ $COUNT SVGs → $MOBILE_SVG"

echo "→ Generating serviceIconXml.ts for React Native..."
node -e "
const fs = require('fs');
const path = require('path');
const dir = '$MOBILE_SVG';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort();
const entries = files.map(f => {
  const xml = fs.readFileSync(path.join(dir, f), 'utf8').trim();
  return '  ' + JSON.stringify(f) + ': ' + JSON.stringify(xml);
});
const content =
  '/** Auto-generated from apps/agent-portal/public/service-icons — do not edit manually. Run: bash scripts/sync-icons.sh */\\n' +
  'export const SERVICE_ICON_XML: Record<string, string> = {\\n' +
  entries.join(',\\n') +
  '\\n};\\n';
fs.writeFileSync('$MOBILE_XML', content);
console.log('  ✓ ' + files.length + ' icons → serviceIconXml.ts');
"

echo ""
echo "✓ Icons synced from web public → mobile. Refresh browser / Metro."

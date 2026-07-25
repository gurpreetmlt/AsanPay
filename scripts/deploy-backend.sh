#!/bin/bash

# AsanPay Backend — Deploy Script
# Usage: ./scripts/deploy-backend.sh "commit message"
#
# Credentials come from .env.deploy.local (gitignored — never commit real tokens).
# First-time setup: copy .env.deploy.local.example to .env.deploy.local and fill it in.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.deploy.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Copy .env.deploy.local.example and fill in your Coolify token."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${COOLIFY_URL:?COOLIFY_URL missing in .env.deploy.local}"
: "${COOLIFY_TOKEN:?COOLIFY_TOKEN missing in .env.deploy.local}"
: "${COOLIFY_APP_UUID:?COOLIFY_APP_UUID missing in .env.deploy.local}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

MSG=${1:-"update backend"}

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  AsanPay Backend Deploy${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Step 1: Git push — scoped to apps/backend only, NOT the whole monorepo.
# (The repo root has a lot of unrelated in-progress churn right now; this script
# should never sweep that into a backend deploy via a root-level `git add -A`.)
echo -e "\n${YELLOW}[1/3] Git push (apps/backend only)...${NC}"
cd "$ROOT/apps/backend"

git add -A
git commit -m "$MSG" 2>/dev/null || echo "  (nothing new to commit)"
git push origin main

cd "$ROOT"
echo -e "${GREEN}✓ Code pushed to GitHub${NC}"

# Step 2: Trigger Coolify redeploy
echo -e "\n${YELLOW}[2/3] Triggering Coolify redeploy...${NC}"
RESPONSE=$(curl -s -X GET \
  "$COOLIFY_URL/api/v1/deploy?uuid=$COOLIFY_APP_UUID&force=false" \
  -H "Authorization: Bearer $COOLIFY_TOKEN")

if echo "$RESPONSE" | grep -q "deployments\|queued\|message"; then
  echo -e "${GREEN}✓ Redeploy started${NC}"
else
  echo -e "${RED}Redeploy trigger failed. Response: $RESPONSE${NC}"
  echo -e "${YELLOW}Trigger it manually from the Coolify dashboard instead.${NC}"
fi

# Step 3: Live logs
echo -e "\n${YELLOW}[3/3] Live logs (Ctrl+C to stop)...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

LAST_LINE=""
sleep 4

while true; do
  LOGS=$(curl -s \
    "$COOLIFY_URL/api/v1/applications/$COOLIFY_APP_UUID/logs" \
    -H "Authorization: Bearer $COOLIFY_TOKEN" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('logs',''))" 2>/dev/null)

  NEW_LINES=$(echo "$LOGS" | tail -20)
  if [ "$NEW_LINES" != "$LAST_LINE" ]; then
    DIFF=$(comm -13 <(echo "$LAST_LINE") <(echo "$NEW_LINES") 2>/dev/null || echo "$NEW_LINES")
    echo "$DIFF"
    LAST_LINE="$NEW_LINES"
  fi

  sleep 2
done

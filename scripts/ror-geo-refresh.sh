#!/bin/bash
OFFSET=0
LIMIT=150
URL="${ROR_URL:-http://localhost:3000/api/admin/authors/ror-geo-refresh}"

if [ -z "$ADMIN_SECRET" ]; then
  ENV_FILE="$(dirname "$0")/../web/.env.local"
  if [ -f "$ENV_FILE" ]; then
    ADMIN_SECRET=$(grep '^ADMIN_SECRET=' "$ENV_FILE" | sed 's/^ADMIN_SECRET=//' | tr -d '"' | tr -d "'")
  fi
fi

if [ -z "$ADMIN_SECRET" ]; then
  echo "Error: ADMIN_SECRET not found in environment or web/.env.local"
  exit 1
fi

while true; do
  RESPONSE=$(curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_SECRET" \
    -d "{\"offset\": $OFFSET, \"limit\": $LIMIT}")

  echo "$(date): $RESPONSE"

  DONE=$(echo $RESPONSE | grep -o '"done":true')
  if [ -n "$DONE" ]; then
    echo "Færdig."
    break
  fi

  OFFSET=$((OFFSET + LIMIT))
  sleep 300  # 5 minutters pause
done

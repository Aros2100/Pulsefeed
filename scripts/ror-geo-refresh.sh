#!/bin/bash
LIMIT=150
URL="${ROR_URL:-http://localhost:3000/api/admin/authors/ror-geo-refresh}"

# Load ADMIN_SECRET from web/.env.local if not set
if [ -z "$ADMIN_SECRET" ]; then
  ENV_FILE="$(dirname "$0")/../web/.env.local"
  if [ -f "$ENV_FILE" ]; then
    ADMIN_SECRET=$(grep '^ADMIN_SECRET=' "$ENV_FILE" | sed 's/^ADMIN_SECRET=//' | tr -d '"' | tr -d "'")
  fi
fi

if [ -z "$ADMIN_SECRET" ]; then
  echo "Error: ADMIN_SECRET not found"
  exit 1
fi

while true; do
  RESPONSE=$(curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ADMIN_SECRET" \
    -d "{\"offset\": 0, \"limit\": $LIMIT}")

  echo "$(date): $RESPONSE"

  PROCESSED=$(echo $RESPONSE | grep -o '"processed":[0-9]*' | cut -d: -f2)
  if [ "$PROCESSED" = "0" ]; then
    echo "Færdig."
    break
  fi

  sleep 300
done

#!/bin/bash
OFFSET=0
LIMIT=150
URL="http://localhost:3000/api/admin/authors/ror-geo-refresh"

while true; do
  RESPONSE=$(curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
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

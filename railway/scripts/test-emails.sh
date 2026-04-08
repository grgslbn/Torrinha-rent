#!/usr/bin/env bash
#
# Test each cron endpoint one by one.
# Make sure the Railway server is running locally first:
#   cd railway && npm run dev
#
# Required env vars (set in your .env or export before running):
#   CRON_SECRET — must match the server's CRON_SECRET
#
# Tip: set EMAIL_DRY_RUN=true in the server's env to redirect
# all emails to OWNER_EMAIL instead of real tenants.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
CRON_SECRET="${CRON_SECRET:?Set CRON_SECRET before running this script}"

echo "=== Torrinha Email Test Suite ==="
echo "Server: $BASE_URL"
echo ""

run_endpoint() {
  local name="$1"
  local path="$2"

  echo "--- $name ---"
  echo "POST $BASE_URL$path"
  echo ""

  curl -s -X POST "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Secret: $CRON_SECRET" | python3 -m json.tool 2>/dev/null || echo "(raw response above)"

  echo ""
  read -rp "Press Enter to continue to next test (or Ctrl+C to stop)..."
  echo ""
}

run_endpoint \
  "1. Reset Month — create pending payment rows" \
  "/cron/reset-month"

run_endpoint \
  "2. Alert Owner (5th) — email owner with unpaid list" \
  "/cron/alert-owner-5"

run_endpoint \
  "3. Remind Tenants (8th) — email each unpaid tenant" \
  "/cron/remind-tenants"

run_endpoint \
  "4. Escalate Owner (15th) — mark overdue + email owner" \
  "/cron/escalate-owner"

echo "=== All tests complete ==="

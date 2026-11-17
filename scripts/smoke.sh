#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"
PING="$(curl --fail --silent --show-error "${BASE_URL}/api/ping")"
RECORD="$(curl --fail --silent --show-error -H 'Content-Type: application/json' \
  -d '{"user_id":"usr_smoke","action":"checkin"}' "${BASE_URL}/api/record")"

python3 - "$PING" "$RECORD" <<'PY'
import json, sys
ping = json.loads(sys.argv[1])
record = json.loads(sys.argv[2])
assert ping["status"] == "ok", ping
assert ping["runtime"] in ("node", "rust"), ping
assert isinstance(ping["uptime_ms"], int), ping
assert record["status"] == "recorded", record
assert isinstance(record["total_rows"], int) and record["total_rows"] > 0, record
print("PASS /api/ping:", json.dumps(ping))
print("PASS /api/record:", json.dumps(record))
PY

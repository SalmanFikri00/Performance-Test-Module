#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <opi-ip-or-host> <round1|round2> [peak-concurrency=1000] [duration=15s]" >&2
  exit 2
}

[[ $# -ge 2 && $# -le 4 ]] || usage
OPI_HOST="$1"
ROUND="$2"
PEAK_CONCURRENCY="${3:-1000}"
DURATION="${4:-15s}"
WARMUP_CONCURRENCY=300
PORT="${PORT:-3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

[[ "$ROUND" == "round1" || "$ROUND" == "round2" ]] || usage
[[ "$PEAK_CONCURRENCY" =~ ^[1-9][0-9]*$ ]] || usage
[[ "$DURATION" =~ ^[1-9][0-9]*([.][0-9]+)?(ms|s|m|h)$ ]] || usage
[[ "$PORT" =~ ^[1-9][0-9]{0,4}$ ]] && (( PORT <= 65535 )) || usage
[[ -n "$OPI_HOST" && "$OPI_HOST" != *://* && "$OPI_HOST" != */* ]] || usage

command -v k6 >/dev/null 2>&1 || {
  echo "k6 is not installed; install k6 on the laptop first (see README.md)." >&2
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  echo "curl is required for the preflight check." >&2
  exit 1
}

BASE_URL="http://${OPI_HOST}:${PORT}"
if [[ "$ROUND" == "round1" ]]; then
  URL="${BASE_URL}/api/ping"
else
  URL="${BASE_URL}/api/record"
fi

if ! PING_RESPONSE="$(curl --fail --silent --show-error --max-time 3 "${BASE_URL}/api/ping")"; then
  echo "Cannot reach ${BASE_URL}; start one server on the Orange Pi and check its IP/firewall." >&2
  exit 1
fi
RUNTIME="$(printf '%s' "$PING_RESPONSE" | sed -nE 's/.*"runtime"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p')"
if [[ "$RUNTIME" != "node" && "$RUNTIME" != "rust" ]]; then
  echo "Unexpected /api/ping response: ${PING_RESPONSE}" >&2
  exit 1
fi

echo "Target: ${BASE_URL} (${RUNTIME})"
echo "Scenario: ${ROUND} -> ${URL}"

auto_status=0
mkdir -p "${PROJECT_ROOT}/results"
STAMP="$(date +%Y%m%d-%H%M%S)"
run_stage() {
  local label="$1"
  local concurrency="$2"
  local logfile="${PROJECT_ROOT}/results/${STAMP}-${ROUND}-${RUNTIME}-${label}-vus${concurrency}.txt"
  local summaryfile="${PROJECT_ROOT}/results/${STAMP}-${ROUND}-${RUNTIME}-${label}-vus${concurrency}.json"

  echo
  echo "== ${ROUND} ${RUNTIME} ${label}: vus=${concurrency}, duration=${DURATION}, URL=${URL} =="
  echo "Saving output to ${logfile}"
  if k6 run --quiet \
    --vus "$concurrency" \
    --duration "$DURATION" \
    --summary-trend-stats 'avg,min,med,max,p(90),p(95)' \
    --summary-export "$summaryfile" \
    -e "BASE_URL=${BASE_URL}" \
    -e "ROUND=${ROUND}" \
    "${SCRIPT_DIR}/bench.js" 2>&1 | tee "$logfile"; then
    return 0
  fi

  echo "Stage ${label} reported failed checks or a k6 error; output is saved. Continuing to the next stage." >&2
  auto_status=1
}

run_stage warmup "$WARMUP_CONCURRENCY"
run_stage peak "$PEAK_CONCURRENCY"

if (( auto_status != 0 )); then
  echo "Benchmark completed with one or more failed stages. Review the saved .txt and .json results." >&2
  exit 1
fi

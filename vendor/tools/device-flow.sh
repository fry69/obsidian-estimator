#!/usr/bin/env bash

set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "This script requires jq. Install it and retry." >&2
  exit 1
fi

CLIENT_ID=${GH_CLIENT_ID:-}
CLIENT_SECRET=${GH_CLIENT_SECRET:-}
SCOPE=${GH_DEVICE_SCOPE:-} # Optional override; defaults to GitHub App scopes

if [[ -z "$CLIENT_ID" ]]; then
  echo "Set GH_CLIENT_ID in your environment before running this script." >&2
  exit 1
fi

PAYLOAD=(-d "client_id=$CLIENT_ID")
if [[ -n "$SCOPE" ]]; then
  PAYLOAD+=(-d "scope=$SCOPE")
fi

DEVICE_RESPONSE=$(curl -s -X POST "https://github.com/login/device/code" \
  -H "Accept: application/json" \
  "${PAYLOAD[@]}")

VERIFICATION_URI=$(jq -r '.verification_uri' <<<"$DEVICE_RESPONSE")
USER_CODE=$(jq -r '.user_code' <<<"$DEVICE_RESPONSE")
DEVICE_CODE=$(jq -r '.device_code' <<<"$DEVICE_RESPONSE")
INTERVAL=$(jq -r '.interval' <<<"$DEVICE_RESPONSE")
EXPIRES_IN=$(jq -r '.expires_in' <<<"$DEVICE_RESPONSE")

if [[ -z "$DEVICE_CODE" || "$DEVICE_CODE" == "null" ]]; then
  echo "Failed to obtain a device code: $DEVICE_RESPONSE" >&2
  exit 1
fi

if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]]; then
  INTERVAL=5
fi

cat <<EOF
[device-flow] Complete authorization in your browser:
  1. Open: $VERIFICATION_URI
  2. Enter the one-time code: $USER_CODE
     (code expires in ${EXPIRES_IN:-unknown} seconds)

Leave this script running; it will poll GitHub until authorization completes.
EOF

sleep "$INTERVAL"

while true; do
  RESPONSE=$(curl -s -X POST "https://github.com/login/oauth/access_token" \
    -H "Accept: application/json" \
    -d "client_id=$CLIENT_ID" \
    -d "device_code=$DEVICE_CODE" \
    -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \
    ${CLIENT_SECRET:+-d "client_secret=$CLIENT_SECRET"})

  ERROR=$(jq -r '.error // empty' <<<"$RESPONSE")

  case "$ERROR" in
    "")
      jq . <<<"$RESPONSE"
      echo
      echo "[device-flow] Copy the refresh_token (ghr_...) into the GITHUB_OAUTH KV namespace under GH_REFRESH."
      break
      ;;
    "authorization_pending")
      echo "[device-flow] Waiting for approval..."
      sleep "$INTERVAL"
      ;;
    "slow_down")
      INTERVAL=$((INTERVAL + 5))
      echo "[device-flow] Received slow_down; backing off to $INTERVAL seconds."
      sleep "$INTERVAL"
      ;;
    *)
      DESCRIPTION=$(jq -r '.error_description // .error' <<<"$RESPONSE")
      echo "Error while polling for tokens: $DESCRIPTION" >&2
      exit 1
      ;;
  esac
done

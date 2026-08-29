#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

mode="${1:---phone}"
case "$mode" in
  --phone|--webrtc|--chat) ;;
  *)
    echo "Usage: $0 [--phone|--webrtc|--chat]" >&2
    exit 2
    ;;
esac

if [[ "$mode" == "--phone" && -z "${GUAVA_AGENT_NUMBER:-}" ]]; then
  echo "Set GUAVA_AGENT_NUMBER in .env before starting the phone demo." >&2
  exit 2
fi

if [[ -z "${CARESIGNAL_DEMO_TOKEN:-}" ]]; then
  echo "Set CARESIGNAL_DEMO_TOKEN in .env before exposing the demo on the LAN." >&2
  exit 2
fi

if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
  echo "Port 8000 is already serving CareSignal. Stop it before starting the demo." >&2
  exit 1
fi

npm --prefix web run build
uv run python scripts/seed_demo.py

CARE_SIGNAL_HOST=0.0.0.0 uv run care-signal &
api_pid=$!

cleanup() {
  kill "$api_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in {1..40}; do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
  echo "CareSignal API did not start on http://127.0.0.1:8000." >&2
  exit 1
fi

echo "Dashboard: http://127.0.0.1:8000/?token=${CARESIGNAL_DEMO_TOKEN}"

lan_ip=""
if command -v route >/dev/null 2>&1 && command -v ipconfig >/dev/null 2>&1; then
  lan_interface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  if [[ -n "$lan_interface" ]]; then
    lan_ip="$(ipconfig getifaddr "$lan_interface" 2>/dev/null || true)"
  fi
elif command -v hostname >/dev/null 2>&1; then
  lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi

if [[ -n "$lan_ip" ]]; then
  echo "Room device: http://${lan_ip}:8000/resident"
else
  echo "Room device: http://<laptop-LAN-IP>:8000/resident"
fi
echo "Starting Guava in ${mode#--} mode..."

guava run agent -- "$mode"

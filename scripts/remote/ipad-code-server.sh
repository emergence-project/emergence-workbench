#!/usr/bin/env zsh
# iPad 등 내 다른 기기에서 Tailscale로 이 맥의 code-server(브라우저용 VS Code)를 연다.
# 백그라운드 서비스(~/Library/LaunchAgents)가 실행한다.
# - Tailscale 주소에서만 받는다. Tailscale이 꺼져 있으면 켜질 때까지 기다리다가 끝난다.
# - 로그인(비밀번호)을 반드시 켠다. 비밀번호는 ~/.config/code-server/config.yaml의 password다.
# 2026-10-01 ai-automation-dashboard(보관)에서 옮겨 왔다.
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:$HOME/.local/bin:$PATH"

PORT="${IPAD_CODE_SERVER_PORT:-8080}"
WORKSPACE="${IPAD_CODE_SERVER_WORKSPACE:-$HOME/GitHub}"
TAILSCALE_BIN="${TAILSCALE_BIN:-/usr/local/bin/tailscale}"
CODE_SERVER_BIN="${CODE_SERVER_BIN:-/opt/homebrew/bin/code-server}"
IFCONFIG_BIN="${IFCONFIG_BIN:-/sbin/ifconfig}"
STARTUP_ATTEMPTS="${IPAD_CODE_SERVER_STARTUP_ATTEMPTS:-60}"
STARTUP_INTERVAL_SECONDS="${IPAD_CODE_SERVER_STARTUP_INTERVAL_SECONDS:-2}"

is_local_address_active() {
  local address="$1"

  "$IFCONFIG_BIN" | /usr/bin/awk -v target="$address" '
    $1 == "inet" && $2 == target { found = 1 }
    END { exit !found }
  '
}

tailscale_ip=""
for ((attempt = 1; attempt <= STARTUP_ATTEMPTS; attempt++)); do
  tailscale_ip="$("$TAILSCALE_BIN" ip -4 2>/dev/null | /usr/bin/head -n 1 || true)"
  if [[ -n "$tailscale_ip" ]] && is_local_address_active "$tailscale_ip"; then
    break
  fi

  tailscale_ip=""
  if ((attempt < STARTUP_ATTEMPTS)); then
    /bin/sleep "$STARTUP_INTERVAL_SECONDS"
  fi
done

if [[ -z "$tailscale_ip" ]]; then
  echo "No active local Tailscale IPv4 address available; code-server not started." >&2
  exit 1
fi

exec "$CODE_SERVER_BIN" \
  --bind-addr "${tailscale_ip}:${PORT}" \
  --auth password \
  "$WORKSPACE"

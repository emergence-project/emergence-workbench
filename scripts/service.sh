#!/bin/zsh
# 연구 작업대 백그라운드 서비스 관리 (macOS LaunchAgent).
# 로그인하면 자동으로 켜지고, 꺼지면 다시 켜진다. Claude 세션이나 터미널 창과 무관하다.
#   install    화면을 빌드하고 서비스를 등록·시작
#   restart    화면을 다시 빌드하고 서비스를 재시작 (코드를 고친 뒤 실사용 앱에 반영)
#   status     켜져 있는지
#   logs       최근 로그
#   uninstall  서비스를 멈추고 등록을 지운다 (연구 파일·설정은 그대로)
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.research-workspace.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/research-workspace.log"
DOMAIN="gui/$(id -u)"
URL="http://127.0.0.1:5174/"
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

build() { (cd "$REPO" && pnpm --filter @rw/web build >/dev/null) && echo "화면 빌드 완료"; }

wait_up() {
  for i in {1..60}; do curl -s -o /dev/null --max-time 1 "$URL" && { echo "켜짐: $URL"; return 0; }; sleep 0.5; done
  echo "30초 안에 켜지지 않았습니다. 로그: $LOG"; return 1
}

case "${1:-status}" in
  install)
    build
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$REPO/scripts/serve.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$PLIST"
    wait_up ;;
  restart)
    build
    launchctl kickstart -k "$DOMAIN/$LABEL"
    wait_up ;;
  status)
    if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then echo "서비스 등록됨"; else echo "서비스 등록 안 됨 (install 필요)"; fi
    curl -s -o /dev/null --max-time 1 "$URL" && echo "응답함: $URL" || echo "응답 없음" ;;
  logs)
    tail -n 60 "$LOG" ;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "서비스를 지웠습니다. 연구 파일과 ~/.config/research-workspace 설정은 그대로입니다." ;;
  *)
    echo "사용법: service.sh install|restart|status|logs|uninstall"; exit 1 ;;
esac

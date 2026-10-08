#!/bin/zsh
# 연구 작업대 열기 — 백그라운드 서비스가 있으면 전용 창으로 연다.
# 서비스를 설치하지 않았다면 이 터미널 창에서 서버를 켠다(창을 닫으면 꺼짐). 서비스 설치: pnpm service:install
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:$PATH"
if curl -s -o /dev/null --max-time 1 http://127.0.0.1:5174/ || launchctl print "gui/$(id -u)/com.research-workspace.app" >/dev/null 2>&1; then
  exec zsh scripts/open-app.sh
fi
echo "서비스가 없어 이 창에서 켭니다 (창을 닫으면 앱이 꺼집니다)"
( until curl -s -o /dev/null --max-time 1 http://127.0.0.1:5174/; do sleep 0.5; done; zsh scripts/open-app.sh ) &
exec pnpm start

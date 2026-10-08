#!/bin/zsh
# 앱 아이콘이 실행한다: 서버가 꺼져 있으면 서비스를 깨우고, 주소창 없는 전용 창으로 연다.
# 크롬에서 "앱으로 설치"를 했으면 그 앱을 연다(Dock에 크롬이 아니라 연구 작업대로 뜬다).
URL="http://127.0.0.1:5174/"
if ! curl -s -o /dev/null --max-time 1 "$URL"; then
  launchctl kickstart "gui/$(id -u)/com.research-workspace.app" 2>/dev/null || true
  for i in {1..30}; do curl -s -o /dev/null --max-time 1 "$URL" && break; sleep 0.5; done
fi
for PWA in "$HOME/Applications/Chrome Apps.localized/Emergence Workbench.app" "$HOME/Applications/Chrome Apps/Emergence Workbench.app" "$HOME/Applications/Chrome Apps.localized/연구 작업대.app" "$HOME/Applications/Chrome Apps/연구 작업대.app"; do
  [ -d "$PWA" ] && exec open "$PWA"
done
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL"
else
  open "$URL"
fi

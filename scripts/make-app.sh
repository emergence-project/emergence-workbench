#!/bin/zsh
# "연구 작업대.app"을 만든다: 누르면 scripts/open-app.sh를 실행해 주소창 없는 전용 창으로 앱을 연다.
# 만든 앱은 ~/Applications에 두고, 바탕화면에 바로가기를 놓는다. 다시 실행하면 새로 만든다.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Applications/연구 작업대.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1. 아이콘: SVG → PNG(Quick Look) → 여러 크기 → .icns
qlmanage -t -s 1024 -o "$WORK" "$REPO/scripts/app-icon.svg" >/dev/null 2>&1
SET="$WORK/icon.iconset"; mkdir -p "$SET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$WORK/app-icon.svg.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$WORK/app-icon.svg.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o "$WORK/app.icns"

# 2. 앱: AppleScript 한 줄짜리 실행기
cat > "$WORK/main.applescript" <<SCRIPT
do shell script "/bin/zsh " & quoted form of "$REPO/scripts/open-app.sh" & " >/dev/null 2>&1 &"
SCRIPT
mkdir -p "$HOME/Applications"
rm -rf "$APP"
osacompile -o "$APP" "$WORK/main.applescript"
cp "$WORK/app.icns" "$APP/Contents/Resources/applet.icns"
# 새 macOS는 Assets.car의 기본 아이콘을 먼저 쓰므로 지우고 applet.icns를 쓰게 한다. 고친 뒤 다시 서명한다.
rm -f "$APP/Contents/Resources/Assets.car"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true
# osacompile은 번들 ID를 넣지 않는다. 이름에서 만든 임시 ID 대신 고정 ID를 준다.
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.research-workspace.launcher" "$APP/Contents/Info.plist" 2>/dev/null || true
codesign --force --deep --sign - "$APP" 2>/dev/null
touch "$APP"
# 다 고친 번들로 LaunchServices 기록을 새로 쓴다. 만드는 도중에 잡힌 기록(실행 파일 없음)이 남으면 -10810으로 열리지 않는다.
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f -R "$APP"

# 3. 바탕화면 바로가기
ln -sfn "$APP" "$HOME/Desktop/연구 작업대"
echo "만듦: $APP"
echo "바로가기: ~/Desktop/연구 작업대 (Dock에 두려면 응용 프로그램 폴더에서 끌어다 놓기)"

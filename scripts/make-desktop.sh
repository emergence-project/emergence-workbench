#!/bin/zsh
# "Emergence Workbench.app"을 Tauri 창으로 만든다 (10/30 결정 "데스크톱 앱은 Tauri", 코드는 desktop/).
# 창만 맡고 서버는 그대로 서비스(scripts/service.sh)다. Rust(cargo)가 있어야 한다: 없으면 make-app.sh의 실행기를 쓴다.
# 만든 앱은 ~/Applications에 두고 바탕화면 바로가기를 이 앱으로 돌린다. 다시 실행하면 새로 만든다(처음 빌드 몇 분, 그다음은 빠르다).
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Applications/Emergence Workbench.app"
export PATH="$HOME/.cargo/bin:$PATH"
command -v cargo >/dev/null || { echo "cargo가 없습니다. Rust(https://rustup.rs)를 깐 뒤 다시 실행하세요."; exit 1; }
TAURI=(npx -y @tauri-apps/cli@2.12.4)

cd "$REPO/desktop/src-tauri"
# 아이콘은 scripts/app-icon.svg에서 만든다(저장소에 그림 파일을 두지 않는다).
# 아이콘 · 컴파일의 긴 출력은 기록 파일에만 두고, 실패하면 끝부분만 보인다
LOG="$REPO/desktop/src-tauri/target/make-desktop.log"
mkdir -p "${LOG:h}"
echo "창 빌드 중… (처음은 몇 분, 기록: $LOG)"
{ "${TAURI[@]}" icon "$REPO/scripts/app-icon.svg" && "${TAURI[@]}" build --bundles app; } >"$LOG" 2>&1 \
  || { tail -n 30 "$LOG"; echo "창을 빌드하지 못했습니다. 기록: $LOG"; exit 1; }
BUILT="$REPO/desktop/src-tauri/target/release/bundle/macos/Emergence Workbench.app"
[ -d "$BUILT" ] || { echo "빌드한 앱이 없습니다: $BUILT"; exit 1; }

mkdir -p "$HOME/Applications"
rm -rf "$APP"
cp -R "$BUILT" "$APP"
codesign --force --deep --sign - "$APP" 2>/dev/null
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSREGISTER" -f -R "$APP"

# 바탕화면 바로가기 (이미 이 앱을 가리키는 것이 있으면 그것을 둔다)
linked=""
for f in "$HOME/Desktop"/*(N@); do [ "$(readlink "$f")" = "$APP" ] && linked="$f"; done
[ -n "$linked" ] || { linked="$HOME/Desktop/Emergence Workbench"; ln -sfn "$APP" "$linked"; }
echo "만듦: $APP (Tauri 창)"
echo "바로가기: $linked"

#!/bin/zsh
# "Emergence Workbench.app"을 Tauri 창으로 만든다 (10/30 결정 "데스크톱 앱은 Tauri", 코드는 desktop/).
# 창만 맡고 서버는 그대로 서비스(scripts/service.sh)다. Rust(cargo)가 있어야 한다: 없으면 make-app.sh의 실행기를 쓴다.
# 만든 앱은 ~/Applications에 두고 바탕화면 바로가기를 이 앱으로 돌린다. 다시 실행하면 새로 만든다(처음 빌드 몇 분, 그다음은 빠르다).
# --standalone: 서버를 품은 내려받는 앱을 만든다(scripts/bundle-app.mjs로 Node · 서버 · 화면을 묶어 넣음). ~/Applications에 두지 않고 만든 자리만 알린다.
#   zsh scripts/make-desktop.sh --standalone   (이 맥의 칩에 맞춰 만든다)
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Applications/Emergence Workbench.app"
STANDALONE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --standalone) STANDALONE=1 ;;
    *) echo "사용법: make-desktop.sh [--standalone]"; exit 1 ;;
  esac
  shift
done
export PATH="$HOME/.cargo/bin:$PATH"
command -v cargo >/dev/null || { echo "cargo가 없습니다. Rust(https://rustup.rs)를 깐 뒤 다시 실행하세요."; exit 1; }
TAURI=(npx -y @tauri-apps/cli@2.12.4)

CONFIG=()
if [ $STANDALONE = 1 ]; then
  echo "서버 묶기…"
  node "$REPO/scripts/bundle-app.mjs"
  CONFIG=(--config tauri.standalone.conf.json)
fi

cd "$REPO/desktop/src-tauri"
# 아이콘은 scripts/app-icon.svg에서 만든다(저장소에 그림 파일을 두지 않는다).
# 아이콘 · 컴파일의 긴 출력은 기록 파일에만 두고, 실패하면 끝부분만 보인다
LOG="$REPO/desktop/src-tauri/target/make-desktop.log"
mkdir -p "${LOG:h}"
echo "창 빌드 중… (처음은 몇 분, 기록: $LOG)"
{ "${TAURI[@]}" icon "$REPO/scripts/app-icon.svg" && "${TAURI[@]}" build --bundles app "${CONFIG[@]}"; } >"$LOG" 2>&1 \
  || { tail -n 30 "$LOG"; echo "창을 빌드하지 못했습니다. 기록: $LOG"; exit 1; }
BUILT="$REPO/desktop/src-tauri/target/release/bundle/macos/Emergence Workbench.app"
[ -d "$BUILT" ] || { echo "빌드한 앱이 없습니다: $BUILT"; exit 1; }
if [ $STANDALONE = 1 ]; then
  echo "만듦: $BUILT (서버를 품은 앱, $(du -sh "$BUILT" | cut -f1))"
  echo "이 맥에 서비스가 등록돼 있으면 앱은 그 서비스를 씁니다. 묶은 서버를 보려면 서비스가 없는 계정이나 맥에서 여세요."
  exit 0
fi

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

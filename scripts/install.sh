#!/bin/zsh
# 맥에 앱을 설치한다: 받은 앱 폴더에서 한 번 실행하면 이 컴퓨터에서 쓸 준비를 모두 마친다.
#   zsh scripts/install.sh            (또는 pnpm mac:install)
# 하는 일 (몇 번을 다시 실행해도 된다. 이미 된 것은 건너뛰고, 앱 폴더를 옮겼으면 새 경로로 고친다):
#   1. 준비물: Node 22 · pnpm (Homebrew가 있으면 없는 것을 깐다)
#   2. 의존성 (pnpm install)
#   3. 백그라운드 서비스 (scripts/service.sh install: 로그인하면 켜지고 자동 업데이트를 받는다)
#   4. 앱 (Rust가 있으면 scripts/make-desktop.sh의 Tauri 창, 없거나 --no-desktop이면 scripts/make-app.sh의 실행기. ~/Applications · Spotlight · Launchpad · 바탕화면)
#   5. Dock에 고정 (--no-dock으로 건너뜀)
#   6. 에이전트 등록: Claude Code · Codex 설정에 이 앱의 MCP 입구 (--no-agents로 건너뜀, docs/agent-mcp.md)
# 연구 파일과 ~/.config/research-workspace 설정은 건드리지 않는다. 빼기: pnpm service:uninstall, 앱은 휴지통으로.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Applications/Emergence Workbench.app"
DOCK=1 AGENTS=1 DESKTOP=1
for a in "$@"; do
  case "$a" in
    --no-dock) DOCK=0 ;;
    --no-agents) AGENTS=0 ;;
    --no-desktop) DESKTOP=0 ;;
    *) echo "사용법: install.sh [--no-dock] [--no-agents] [--no-desktop]"; exit 1 ;;
  esac
done
[ "$(uname)" = Darwin ] || { echo "맥에서만 설치합니다. 다른 컴퓨터에서는 pnpm start로 켭니다."; exit 1; }
# 서비스(serve.sh)와 같은 순서로 찾는다: Homebrew의 node@22가 먼저
export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

DONE=() SKIP=() WARN=()
step() { print -P "%B$1%b" }

# 1. 준비물
step "1. 준비물"
node_major() { node -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || echo 0 }
if [ "$(node_major)" != 22 ]; then
  if command -v brew >/dev/null; then brew install node@22; else
    echo "Node 22가 없습니다. https://nodejs.org 에서 22를 깔거나 Homebrew(https://brew.sh)를 깐 뒤 다시 실행하세요."; exit 1
  fi
fi
if ! command -v pnpm >/dev/null; then corepack enable pnpm 2>/dev/null || npm install -g pnpm@12; fi
command -v git >/dev/null || { echo "git이 없습니다. 터미널에서 xcode-select --install 을 한 뒤 다시 실행하세요."; exit 1; }
NODE="$(command -v node)"
echo "node $(node -v) · pnpm $(pnpm -v)"

# 2. 의존성
step "2. 의존성"
(cd "$REPO" && pnpm install --frozen-lockfile)

# 3. 서비스: 이미 있으면 다시 시작만 (install은 plist를 이 폴더 경로로 다시 쓴다)
step "3. 백그라운드 서비스"
PLIST="$HOME/Library/LaunchAgents/com.research-workspace.app.plist"
if [ -f "$PLIST" ] && grep -qF "$REPO/scripts/serve.sh" "$PLIST"; then
  zsh "$REPO/scripts/service.sh" restart; DONE+=("서비스 다시 시작")
else
  zsh "$REPO/scripts/service.sh" install; DONE+=("서비스 등록")
fi

# 4. 앱: Rust가 있으면 Tauri 창, 아니면 크롬 전용 창을 여는 실행기
step "4. 앱"
WINDOW=launcher
if [ $DESKTOP = 1 ] && [ -x "$HOME/.cargo/bin/cargo" -o -n "$(command -v cargo)" ]; then
  if zsh "$REPO/scripts/make-desktop.sh"; then WINDOW=tauri; DONE+=("앱 (Tauri 창, ~/Applications · 바탕화면)")
  else WARN+=("Tauri 창을 만들지 못해 실행기를 씀 (zsh scripts/make-desktop.sh로 다시)"); fi
fi
if [ $WINDOW = launcher ]; then
  zsh "$REPO/scripts/make-app.sh"
  DONE+=("앱 아이콘 (~/Applications · 바탕화면)")
  [ $DESKTOP = 1 ] && SKIP+=("Tauri 창 (Rust가 없음: https://rustup.rs)")
fi

# 5. Dock: Tauri 창이면 그 앱, 아니면 크롬에서 "앱으로 설치"한 것이 있으면 그것을(실행하면 그 아이콘이 뜬다), 없으면 위 앱을
step "5. Dock"
if [ $DOCK = 1 ]; then
  target="$APP"
  [ $WINDOW = tauri ] || for p in "$HOME/Applications/Chrome Apps.localized/Emergence Workbench.app" "$HOME/Applications/Chrome Apps/Emergence Workbench.app"; do
    [ -d "$p" ] && { target="$p"; break; }
  done
  url="file://${target// /%20}/"
  dock="$(defaults read com.apple.dock persistent-apps 2>/dev/null || true)"
  if print -r -- "$dock" | grep -qF "$url"; then
    SKIP+=("Dock (이미 있음)")
  elif [ $WINDOW = tauri ] && print -r -- "$dock" | grep -qF "Emergence%20Workbench.app"; then
    # 예전 크롬 창(앱으로 설치)을 가리키는 Dock 항목을 Tauri 창으로 돌린다 (맥북 10/30: 그대로 두면 Dock이 크롬 창을 연다)
    tmp="$(mktemp -t dock)"
    defaults export com.apple.dock "$tmp"
    PB=/usr/libexec/PlistBuddy i=0
    while "$PB" -c "Print :persistent-apps:$i" "$tmp" >/dev/null 2>&1; do
      key=":persistent-apps:$i:tile-data:file-data:_CFURLString"
      u="$("$PB" -c "Print $key" "$tmp" 2>/dev/null || true)"
      [[ "$u" == *Emergence%20Workbench.app* ]] && "$PB" -c "Set $key $url" "$tmp"
      i=$((i + 1))
    done
    defaults import com.apple.dock "$tmp" && rm -f "$tmp"
    killall Dock 2>/dev/null || true
    DONE+=("Dock (크롬 창 → Tauri 창)")
  else
    defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>$url</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
    killall Dock 2>/dev/null || true
    DONE+=("Dock")
  fi
else
  SKIP+=("Dock (--no-dock)")
fi

# 6. 에이전트 등록 (사용자 범위: 연구 저장소에는 아무 파일도 더하지 않는다)
step "6. 에이전트 등록"
if [ $AGENTS = 1 ]; then
  while IFS= read -r line; do
    case "$line" in ✓*) DONE+=("${line#✓ }") ;; –*) SKIP+=("${line#– }") ;; *) WARN+=("${line#! }") ;; esac
  done < <(zsh "$REPO/scripts/register-agents.sh" "$NODE")
else
  SKIP+=("에이전트 (--no-agents)")
fi

echo
echo "설치를 마쳤습니다: http://127.0.0.1:5174"
for d in $DONE; do echo "  ✓ $d"; done
for d in $SKIP; do echo "  – $d"; done
for d in $WARN; do echo "  ! $d"; done
echo "남은 준비(GitHub 로그인 · 커밋 이름 · 첫 프로젝트)는 앱의 설정 › 계정 › 시작 준비에 있습니다."
echo "에이전트는 새로 연 세션부터 이 앱을 부릅니다."
open "$APP"

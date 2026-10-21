#!/bin/zsh
# Claude Code · Codex 설정에 이 앱의 MCP 입구를 사용자 범위로 등록한다 (scripts/install.sh 6단계, 혼자서도 실행한다).
#   zsh scripts/register-agents.sh [node 경로]
# 이미 이 폴더의 입구가 등록돼 있으면 건너뛰고, 다른 경로(앱 폴더를 옮김)면 지우고 다시 등록한다.
# 줄마다 결과 하나: "✓ 한 것", "– 건너뛴 것", "! 손으로 할 것". 연구 저장소에는 아무 파일도 더하지 않는다.
REPO="$(cd "$(dirname "$0")/.." && pwd)"
MCP="$REPO/scripts/mcp.mjs"
NAME="emergence-workbench"
NODE="${1:-$(command -v node)}"
NODE="${NODE:-node}"

if command -v claude >/dev/null; then
  if claude mcp get "$NAME" 2>/dev/null | grep -qF "$MCP"; then echo "– Claude Code (이미 등록)"
  else
    claude mcp remove --scope user "$NAME" >/dev/null 2>&1
    if claude mcp add --scope user "$NAME" -- "$NODE" "$MCP" >/dev/null 2>&1; then echo "✓ Claude Code 등록"
    else echo "! Claude Code 등록 실패: claude mcp add --scope user $NAME -- $NODE $MCP"; fi
  fi
else echo "– Claude Code (없음)"; fi

TOML="$HOME/.codex/config.toml"
# PATH에 없어도 ChatGPT 데스크톱 앱에 든 Codex CLI를 쓴다 (10/22 맥미니)
CODEX="$(command -v codex)"
BUNDLED="/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex"
[ -z "$CODEX" ] && [ -x "$BUNDLED" ] && CODEX="$BUNDLED"
if [ -n "$CODEX" ]; then
  if [ -f "$TOML" ] && grep -qF "$MCP" "$TOML"; then echo "– Codex (이미 등록)"
  else
    "$CODEX" mcp remove "$NAME" >/dev/null 2>&1
    if "$CODEX" mcp add "$NAME" -- "$NODE" "$MCP" >/dev/null 2>&1; then echo "✓ Codex 등록"
    elif ! grep -q "^\[mcp_servers\.$NAME\]" "$TOML" 2>/dev/null; then
      # mcp 명령이 없는 옛 Codex: 설정 파일에 직접 더한다
      mkdir -p "$HOME/.codex"
      printf '\n[mcp_servers.%s]\ncommand = "%s"\nargs = ["%s"]\n' "$NAME" "$NODE" "$MCP" >> "$TOML"
      echo "✓ Codex 등록 (config.toml)"
    else echo "! Codex: $TOML 의 [mcp_servers.$NAME] 경로를 $MCP 로 고쳐 주세요"; fi
  fi
else echo "– Codex (없음)"; fi

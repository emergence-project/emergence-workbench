#!/bin/zsh
# 실사용 서버: 빌드한 화면과 API를 127.0.0.1:5174 하나로 내보낸다.
# 백그라운드 서비스(scripts/service.sh)가 이 파일을 실행한다. 손으로 켤 때는 `pnpm start`.
set -e
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:/usr/bin:/bin:/usr/sbin:/sbin"
# TinyTeX(MacTeX 대신 ~/Library/TinyTeX에 까는 작은 TeX)도 찾는다 (11/20 맥 스튜디오: 깔려 있는데 시작 준비가 latexmk 없음으로 봄)
for d in "$HOME"/Library/TinyTeX/bin/*(N/); do PATH="$PATH:$d"; done
export RW_STATIC=1 RW_PORT=5174
exec ./apps/server/node_modules/.bin/tsx apps/server/src/server.ts

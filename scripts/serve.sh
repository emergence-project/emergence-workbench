#!/bin/zsh
# 실사용 서버: 빌드한 화면과 API를 127.0.0.1:5174 하나로 내보낸다.
# 백그라운드 서비스(scripts/service.sh)가 이 파일을 실행한다. 손으로 켤 때는 `pnpm start`.
set -e
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:/usr/bin:/bin:/usr/sbin:/sbin"
export RW_STATIC=1 RW_PORT=5174
exec ./apps/server/node_modules/.bin/tsx apps/server/src/server.ts

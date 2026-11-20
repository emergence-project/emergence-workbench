#!/usr/bin/env bash
# CI 실행기에 apt 꾸러미를 깐다: bash scripts/ci/apt-install.sh <꾸러미…> (ci.yml의 두 작업이 같이 쓴다)
# scripts/remote 테스트는 맥과 같은 zsh로 스크립트를 돌린다. 나눔 글꼴은 화면 그림의 한글용.
# man-db 색인 갱신을 끄면 apt 설치가 빨라진다
# 미러가 멈추면 apt가 작업 시간 10분을 다 써 버린다 (10/7 두 번): 받기 45초 · 설치 60초에 끊고 세 번까지 다시 한다.
# 가장 나쁠 때 3 × 105초 ≈ 5분 남짓, 단계 한도 6분이라 나머지 검사에 시간이 남는다 (전에는 3 × 240초 = 12분으로 10분을 넘을 수 있었다)
# 받기(update)가 끝나지 않아도 설치는 해 본다 (11/11 세 번): 출처 하나가 멈추면 다시 받기 2번 × 15초가 꼭 45초라 받기가 늘 끊겼고,
# 우분투 저장소가 멀쩡해도 설치까지 가지 못했다. 이제 멈춘 출처는 10초 × 2번에 넘어가고, 받기의 끝 줄을 남겨 어느 출처였는지 보인다.
# 그 끝 줄로 보니 멈춘 것은 실행기의 Azure 우분투 미러였다 (미러 목록 /etc/apt/apt-mirrors.txt의 첫 줄). 한 번 실패하면 그 줄을 빼고
# 목록의 다음 저장소(공식 archive.ubuntu.com)로 받는다. 다른 줄이 없으면 그대로 둔다.
# 11/11의 원인은 실행기에서 ubuntu.com 이름 풀이(DNS)가 시간 초과였던 것이다 (packages.microsoft.com은 됐다. 우리 쪽에서 고칠 것이 없다).
# 다음에 바로 알 수 있게, 첫 실패 뒤에 공식 저장소를 한 번 열어 본 결과(이름 풀이 · 연결 · 응답 가운데 어디서 멈췄나)를 남긴다.
set -u
sudo rm -f /var/lib/man-db/auto-update
apt_opts='-o Acquire::Retries=1 -o Acquire::http::Timeout=10 -o Acquire::https::Timeout=10'
for i in 1 2 3; do
  sudo timeout 45 apt-get $apt_opts update 2>&1 | tail -n 12 || true
  sudo timeout 60 apt-get $apt_opts install -y -qq --no-install-recommends "$@" && exit 0
  echo "apt 시도 $i 실패, 다시 한다"
  if grep -v azure /etc/apt/apt-mirrors.txt 2>/dev/null | grep -q .; then sudo sed -i '/azure/d' /etc/apt/apt-mirrors.txt; fi
  if [ "$i" = 1 ]; then curl -sS -m 5 -o /dev/null -w "archive.ubuntu.com: %{http_code} %{time_total}s\n" https://archive.ubuntu.com/ubuntu/dists/ || true; fi
done
exit 1

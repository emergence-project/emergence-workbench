# 맥에서 실사용하기

[English](mac-setup.md)

README에서 옮긴 운영 안내 (2026-10-08).


Node 22, pnpm, TeX Live(latexmk·xelatex·synctex)가 필요하다.

**실사용: 백그라운드 서비스.** 앱은 macOS 백그라운드 서비스(LaunchAgent)로 돈다. 로그인하면 켜지고, 꺼지면 다시 켜지며, Claude 세션이나 터미널 창과 무관하다. 서버 하나가 빌드한 화면과 API를 `http://127.0.0.1:5174`로 함께 내보낸다.

```sh
pnpm install
pnpm service:install    # 화면 빌드 + 서비스 등록·시작 (처음 한 번)
pnpm service:restart    # 코드를 고친 뒤 실사용 앱에 반영 (다시 빌드 + 재시작)
pnpm service:status     # 켜져 있는지
pnpm service:logs       # 최근 로그 (~/Library/Logs/research-workspace.log)
pnpm service:uninstall  # 서비스 지우기 (연구 파일·설정은 그대로)
```

설정 화면의 "앱 업데이트"도 `service:restart`와 같은 일을 한다: GitHub의 새 버전을 받아(맥의 피드백은 함께 커밋해 올림) 빌드하고 서비스를 다시 시작한다.

여는 법: 바탕화면의 **연구 작업대** 아이콘(또는 `~/Applications/연구 작업대.app`). 주소창 없는 전용 창으로 열린다. 아이콘은 `zsh scripts/make-app.sh`로 다시 만든다(원본 그림 `scripts/app-icon.svg`).

Dock에 따로 띄우기: 앱을 연 크롬 창에서 ⋮ → 전송, 저장, 공유 → **페이지를 앱으로 설치**(설치 정보는 `apps/web/public/manifest.webmanifest`와 아이콘). 그러면 크롬과 별개인 자기 창·자기 Dock 아이콘으로 열리고(`~/Applications/Chrome Apps/연구 작업대.app`), Dock에서 우클릭 → 옵션 → Dock에 유지. 바탕화면 아이콘도 설치된 앱이 있으면 그것을 연다. 서비스가 늘 켜져 있어(로그인 때 켜지고 꺼지면 다시 켜짐) 설치한 앱을 바로 눌러도 된다.

**iPad에서 코드 열기 (code-server).** `scripts/remote/ipad-code-server.sh`는 Tailscale 주소에서만, 비밀번호 로그인을 켠 채로 이 맥의 code-server(브라우저용 VS Code)를 연다. 백그라운드 서비스(LaunchAgent)로 돌리고, 비밀번호는 code-server 설정 파일에 둔다. Tailscale이 꺼져 있으면 켜질 때까지 기다린다. 시험은 `pnpm test:scripts`.

**설정.** 왼쪽 띠 맨 아래 조절 막대 아이콘. 테마·글자 크기·화면 밀도·강조 색·편집기 글꼴을 바꾸며, 앱 설정 파일(`~/.config/research-workspace/config.yaml`)의 `ui:`에 저장된다. 같은 파일에 등록한 프로젝트와 태그, 공유 라이브러리(`library`), Study vault(`study`, 없으면 iCloud Obsidian의 Study)가 있다. 그 위의 ⓘ는 이 앱 소개, 말풍선은 피드백 모아 보기.

**프로젝트 정본과 STATUS.md.** 프로젝트의 `workbench/research.yaml`에 `sources:`(정본 위치 `canon`, 작업 목록 `tasks`, `bib`, 자료 폴더 `materials`, 검토 문서 폴더 `reviews`, 원고 `manuscript`)를 적으면 앱이 그것을 읽고, `agent-status: true`이면 에이전트가 먼저 읽을 요약 `workbench/STATUS.md`를 바뀔 때마다 다시 쓴다(생성 파일, git 제외).

**피드백 모드.** 제목줄 오른쪽 말풍선 버튼을 켜고 화면 부위를 누르면 그 부위에 코멘트를 남긴다. 코멘트는 부위 이름(각 요소의 `data-ui`)과 함께 `feedback/날짜.md`에 쌓이고, Claude 같은 코딩 에이전트는 이 파일을 읽어 어느 부위인지 바로 안다. `feedback/`는 설정의 개인 저장소(`personalRepo:`)에 있고, 없으면 이 컴퓨터에만 남는다. 다른 사람에게 알릴 것은 피드백 창의 "GitHub에 보내기"로 이슈 초안을 연다([maintaining.md](maintaining.md)).

**개발용.** `pnpm dev`는 서버 8130·화면 5173, `pnpm test`는 테스트. 서비스 없이 손으로 켜려면 `pnpm start`(빌드 후 5174에서 실행, 터미널을 닫으면 꺼짐).

`pnpm dev`는 개발용 모드(`RW_SANDBOX=1`)다. 실사용(5174)과 포트가 달라 함께 띄울 수 있다. Claude Code 미리보기 설정은 `.claude/launch.json`. 저장소 안 `.sandbox/config`를 설정으로 쓰고, 예제 연구(`fixtures/sample-research`)를 `.sandbox/`에 복사해 등록한다. 실제 `~/.config/research-workspace`와 실제 연구 저장소는 건드리지 않는다.


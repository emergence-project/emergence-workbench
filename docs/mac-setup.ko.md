# 맥에서 실사용하기

[English](mac-setup.md)

Node 22와 pnpm이 필요하다. TeX Live(latexmk·xelatex·synctex)는 컴파일할 때만 필요하다.

**설치 (컴퓨터마다 한 번).** 앱 폴더에서

```sh
zsh scripts/install.sh   # 또는 pnpm mac:install. --no-dock · --no-agents · --no-desktop으로 그 단계를 건너뛴다
```

실사용 맥에 필요한 것을 차례로 모두 한다: Node 22 · pnpm(없으면 Homebrew로 깐다), `pnpm install`, 아래 백그라운드 서비스, 앱 아이콘(`~/Applications/Emergence Workbench.app`, Spotlight · Launchpad가 찾고 바탕화면에 바로가기), Dock 아이콘, Claude Code · Codex에 MCP 입구 등록(`scripts/register-agents.sh`, 사용자 범위, 연구 저장소에는 아무 파일도 더하지 않음). 다시 실행하면 된 것은 건너뛰고, 앱 폴더를 옮겼으면 경로를 고친다. 끝나면 앱을 연다. 남은 준비(GitHub 로그인 · 커밋 이름 · 첫 프로젝트)는 설정 › 계정 › 시작 준비에 있고, 빠진 것이 있으면 거기에도 같은 명령이 보인다.

**새 컴퓨터에서 원래 프로젝트 받기.** 설정 › 계정에 쓰던 개인 저장소를 넣고 앱을 다시 시작하면, 다른 컴퓨터가 백업 때 올린 프로젝트 목록(`_settings/<컴퓨터>/projects.yaml`: 이름 · GitHub 주소 · 폴더 이름) 중 이 컴퓨터에 없는 것이 시작 준비의 "다른 컴퓨터의 프로젝트"와 홈 카드에 뜬다. 프로젝트마다 받기, 또는 모두 받기. 앱 설정 사본은 컴퓨터마다 `_settings/<컴퓨터>/config.yaml`에 따로 둔다(프로젝트 경로가 컴퓨터마다 달라서). 다만 프로젝트의 성격 · 분야 · 진행 상태 · 레일에 보이기 · 색은 컴퓨터 사이에 맞춘다: 고칠 때 고친 때를 함께 `projects.yaml`에 올리고, 맞추기(백업)가 끝나면 다른 컴퓨터에서 더 늦게 고친 것을 따른다. 다른 컴퓨터의 프로젝트를 받아 등록할 때도 그 설정을 가져온다(`apps/server/src/profileSync.ts`).

**실사용: 백그라운드 서비스.** 앱은 macOS 백그라운드 서비스(LaunchAgent)로 돈다. 로그인하면 켜지고, 꺼지면 다시 켜지며, Claude 세션이나 터미널 창과 무관하다. 서버 하나가 빌드한 화면과 API를 `http://127.0.0.1:5174`로 함께 내보낸다.

```sh
pnpm install
pnpm service:install    # 화면 빌드 + 서비스 등록·시작 (처음 한 번)
pnpm service:restart    # 코드를 고친 뒤 실사용 앱에 반영 (다시 빌드 + 재시작)
pnpm service:status     # 켜져 있는지
pnpm service:logs       # 최근 로그 (~/Library/Logs/research-workspace.log)
pnpm service:uninstall  # 서비스 지우기 (연구 파일·설정은 그대로)
```

설정 화면의 "앱 업데이트"도 `service:restart`와 같은 일을 한다: GitHub의 새 버전을 받아 빌드하고 서비스를 다시 시작한다.

자동 업데이트 (2026-10-09): 서비스로 돌 때 10분마다 새 버전을 받아 `apps/web/dist-next`에 빌드해 둔다(지금 화면 `dist`는 그대로). 다시 시작은 쉴 때만 한다: 열린 화면이 입력 없이 5분이고 저장할 것이 없을 때, 또는 열린 화면이 없고 5분 동안 쓰기 요청이 없을 때. 처리 중인 요청(컴파일 · 논문 받기 · 질문)이 있으면 미룬다. 상단바의 "새 버전 · 다시 시작"을 누르면 바로 다시 시작한다. 서버가 새 커밋으로 켜지면 `dist-next`를 `dist`로 바꿔 단다. 맥에서 앱 코드를 고쳐 두었으면 받지 않는다.

**Tauri 창 (10/30):** Rust(`cargo`, https://rustup.rs)가 있으면 설치가 `zsh scripts/make-desktop.sh`(= `pnpm desktop:build`)로 같은 이름의 앱을 크롬 대신 자기 창으로 만든다(코드 `desktop/`, 맥은 Safari 엔진). 창만 맡고 서버는 아래 서비스 그대로라 창을 닫아도 에이전트 · 동기화는 돈다. 창은 서버가 답할 때까지 "여는 중…"을 보이고, 서버 밖 주소(논문 · GitHub 링크)는 기본 브라우저로 연다. 창 크기 · 자리와 마지막에 보던 화면을 기억해 다음에 거기서 연다. 메뉴는 맥 표준 메뉴(편집의 복사 · 붙여넣기 등)에 설정…(⌘,) · 업데이트 확인…(설정 › 동기화) · 새로 고침(⌘R) · 처음 화면(⇧⌘H)을 더했다. 처음 빌드는 몇 분 걸린다. Rust가 없거나 `--no-desktop`이면 아래 실행기를 만든다.

여는 법: 바탕화면의 **Emergence Workbench** 아이콘(또는 `~/Applications/Emergence Workbench.app`, Spotlight에서 찾기). 주소창 없는 전용 창으로 열린다. 설치가 `zsh scripts/make-app.sh`로 만들고(원본 그림 `scripts/app-icon.svg`), 예전 이름의 실행기(`연구 작업대.app`)는 지우며 그것을 가리키던 바탕화면 바로가기는 새 앱을 가리키게 한다.

Dock에 따로 띄우기: 앱을 연 크롬 창에서 ⋮ → 전송, 저장, 공유 → **페이지를 앱으로 설치**(설치 정보는 `apps/web/public/manifest.webmanifest`와 아이콘). 그러면 크롬과 별개인 자기 창·자기 Dock 아이콘으로 열리고(`~/Applications/Chrome Apps/연구 작업대.app`), Dock에서 우클릭 → 옵션 → Dock에 유지(설치는 이 앱이 이미 있으면 이것을, 없으면 실행기를 Dock에 둔다). 바탕화면 아이콘도 설치된 앱이 있으면 그것을 연다. 서비스가 늘 켜져 있어(로그인 때 켜지고 꺼지면 다시 켜짐) 설치한 앱을 바로 눌러도 된다.

**iPad에서 코드 열기 (code-server).** `scripts/remote/ipad-code-server.sh`는 Tailscale 주소에서만, 비밀번호 로그인을 켠 채로 이 맥의 code-server(브라우저용 VS Code)를 연다. 백그라운드 서비스(LaunchAgent)로 돌리고, 비밀번호는 code-server 설정 파일에 둔다. Tailscale이 꺼져 있으면 켜질 때까지 기다린다. 시험은 `pnpm test:scripts`.

**설정.** 레일 맨 아래 조절 막대 아이콘. 테마·글자 크기·화면 밀도·강조 색·편집기 글꼴을 바꾸며, 앱 설정 파일(`~/.config/research-workspace/config.yaml`)의 `ui:`에 저장된다. 같은 파일에 등록한 프로젝트와 태그, 공유 라이브러리(`library`), 지식 화면이 읽는 Obsidian vault(`study`)와 Topic Review 폴더(`reviews`)가 있다. 둘은 적어 둔 것만 읽는다. 그 위의 ⓘ는 이 앱 소개, 말풍선은 피드백 모아 보기.

**프로젝트 정본과 STATUS.md.** 프로젝트의 `workbench/research.yaml`에 `sources:`(정본 위치 `canon`, 작업 목록 `tasks`, `bib`, 자료 폴더 `materials`, 검토 문서 폴더 `reviews`, 원고 `manuscript`)를 적으면 앱이 그것을 읽고, `agent-status: true`이면 에이전트가 먼저 읽을 요약 `workbench/STATUS.md`를 바뀔 때마다 다시 쓴다(생성 파일, git 제외).

**피드백 모드.** 제목줄 오른쪽 말풍선 버튼을 켜고 화면 부위를 누르면 그 부위에 코멘트를 남긴다. 코멘트는 부위 이름(각 요소의 `data-ui`)과 함께 `feedback/날짜.md`에 쌓이고, Claude 같은 코딩 에이전트는 이 파일을 읽어 어느 부위인지 바로 안다. `feedback/`는 설정의 개인 저장소(`personalRepo:`)에 있고, 없으면 이 컴퓨터에만 남는다. 다른 사람에게 알릴 것은 공개 저장소의 Issues에 올린다([maintaining.md](maintaining.md)). 피드백 창에는 이슈로 보내는 단추가 없고, 피드백 화면의 "GitHub 이슈로 보내기"에서 여럿을 골라 이슈 초안 하나로 보낸다(10/22).

**개발용.** `pnpm dev`는 서버 8130·화면 5173, `pnpm test`는 테스트. 서비스 없이 손으로 켜려면 `pnpm start`(빌드 후 5174에서 실행, 터미널을 닫으면 꺼짐).

`pnpm dev`는 개발용 모드(`RW_SANDBOX=1`)다. 실사용(5174)과 포트가 달라 함께 띄울 수 있다. Claude Code 미리보기 설정은 `.claude/launch.json`. 저장소 안 `.sandbox/config`를 설정으로 쓰고, 예제 연구(`fixtures/sample-research`)를 `.sandbox/`에 복사해 등록한다. 실제 `~/.config/research-workspace`와 실제 연구 저장소는 건드리지 않는다. 서버를 띄울 때 `fixtures/`·`templates/shared-library`의 내용 도장을 `.sandbox/.fixture-stamp`와 비교해, 다르면 예제 폴더(예제 연구·라이브러리·피드백 등)만 새로 복사한다. `.sandbox/config`(설정)는 그대로 두지만, 예제 모드에서 남긴 피드백·고침은 그때 지워진다. `pnpm shots`는 이 폴더를 쓰지 않고 실행마다 `.sandbox-shots/`를 새로 만든다.


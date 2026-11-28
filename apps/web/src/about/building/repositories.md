---
id: repositories
kind: reference
title:
  ko: 저장소 · 서버 · 계정
  en: Repositories, servers and accounts
summary:
  ko: 무엇이 어느 저장소에 있고, 컴퓨터 · 집 서버 · GitHub · 중계 서버 사이에 무엇이 언제 오가며, 로그인 열쇠가 어디에 있고, 무엇을 공개하는지입니다.
  en: What lives in which repository, what moves between your computers, the home server, GitHub and the relay and when, where sign-in keys are kept, and what is public.
figure: RepoMapFigure
---
<!-- ko -->
- **저장소.** 모든 기록은 사람이 읽는 텍스트 파일이고 이력은 git이 남겨, 앱이 없어도 읽힙니다.
  - 앱 저장소 (공개, MIT): 앱 코드, 이 소개, 형식 문서(`docs/`), 지어낸 예제(`fixtures/`). `apps/server`는 컴퓨터에서 도는 앱 서버, `apps/web`은 화면, `packages/core`는 둘이 함께 쓰는 계산과 API 계약, `desktop/`은 데스크톱 창(Tauri), `relay/`는 중계 서버입니다.
  - 개인 저장소 (비공개, 사용자마다 하나): 피드백 원문과 처리 기록(`feedback/`), 요구와 결정 표(`planning/`), 모든 연구의 공통 규칙(`rules/research.md`), 컴퓨터마다의 앱 설정 사본과 기기 정보(`_settings/<컴퓨터>/`), 집 서버 정보(`_settings/server.yaml`), 에이전트 대화 사본(`_chats/<컴퓨터>/`). 계정 › 시작 준비에서 정하고, 앱이 설정 폴더에 사본을 받아 둡니다.
  - 연구 저장소 (프로젝트마다 하나): 원고 · 노트 · 기록. 앱이 읽고 쓰는 곳은 `workbench/`이고, 앱은 저장소를 옮기지 않고 경로만 등록합니다. 형식은 `docs/repo-format.md`.
  - 라이브러리 저장소: 개념노트 · 논문 · 그림 · 공용 서식(`preamble/`)과 참고문헌. 모든 프로젝트가 함께 씁니다.
  - 설치판의 계정 저장소: 설치 파일로 깐 앱은 GitHub로 로그인하면 그 계정에 비공개 저장소를 저절로 만듭니다. 설정과 프로젝트 목록(`emergence-workbench-home`), 프로젝트마다 하나, 라이브러리(`-library`), 논문 PDF(`-papers`). 같은 계정으로 로그인한 다른 컴퓨터가 이것을 받아 같은 상태가 됩니다.
- **동기화.** 정본은 GitHub이고, 컴퓨터는 받고 올려서 맞춥니다. 간격은 설정 › 동기화에서 칸마다 수동 | 자동으로 고릅니다.
  - 기록 · 피드백은 쓴 뒤 곧(처음 30초) 올리고, 연구 저장소 · 라이브러리는 정한 간격으로 받습니다.
  - `workbench/`를 git이 추적하지 않는 연구는 한 시간마다 개인 저장소에 백업합니다(설치판은 프로젝트를 계정 저장소에 2분마다).
  - 한 시간마다 개인 저장소와 맞추며 기기 정보를 올리고, 내 이름 · 소속 · 커밋 이름은 늦게 고친 쪽을 모든 컴퓨터가 따릅니다. 로그인 열쇠와 이메일은 올리지 않습니다.
  - 두 컴퓨터가 같은 파일을 고쳤으면 세 갈래로 합치고, 합칠 수 없으면 멈추고 알립니다. 지우지 않고 옆에 남깁니다.
  - 피드백이 관리자에게 가는 길은 셋입니다. 관리자 앱은 개인 저장소의 `feedback/`에 바로 올립니다. 그 밖의 앱은 피드백 화면의 「관리자에게 보내기」를 한 번 누른 뒤로 중계 서버를 거쳐 관리자 개인 저장소의 `feedback/from/`에 쌓입니다. 중계가 안 되면 피드백 파일로 내보내 메일 등으로 건네고, 관리자가 가져옵니다. 처리 기록은 관리자 쪽에서 `feedback/status.yaml`에 적고 앱이 받아 피드백 화면에 보입니다.
- **계정.** 로그인은 레일 아래 계정 단추가 여는 계정 페이지에서만 합니다.
  - GitHub: 「GitHub로 로그인」이 보여 주는 코드를 GitHub에 넣으면 됩니다. 받은 열쇠는 이 컴퓨터의 보안 저장소(맥 키체인, 윈도우는 그 사용자 계정으로 잠근 파일)에만 둡니다. 이미 있는 `gh` · 키체인 로그인도 그대로 씁니다.
  - Claude · Codex: 이 컴퓨터의 Claude Code · Codex 로그인을 쓰고, 계정을 더 붙일 수 있습니다. 대화 종류마다 쓸 계정은 설정 › 에이전트에서 고릅니다.
  - 구글(선택): 열쇠는 이 컴퓨터에만 두고, 화면 설정과 프로젝트 목록만 구글 드라이브의 앱 전용 공간에 둡니다. 연구 파일 내용은 보내지 않습니다.
  - 집 서버가 있으면 설정 › 기기 관리에서 다른 컴퓨터를 로그아웃시킬 수 있습니다(GitHub · 구글 로그인과 더한 계정을 뺌, 연구 파일은 남음).
- **서버.** 관리자가 따로 돌리는 서버에 기대지 않습니다. 저장은 GitHub, 계산은 내 컴퓨터입니다.
  - 앱 서버: 컴퓨터마다 하나, 백그라운드 서비스로 `127.0.0.1:5174`에서 돕니다. 파일을 읽고 쓰고, 화면과 에이전트(MCP)에 API를 줍니다. 창은 화면만 그리므로 창을 닫아도 에이전트 대화는 이어집니다.
  - 집 서버 (선택): 설정 › 기기 관리에서 늘 켜 두는 컴퓨터 하나를 서버로 정합니다. 내 기기끼리만 잇는 Tailscale 주소로만 열려 바깥 인터넷에 드러나지 않습니다. 다른 컴퓨터가 1분마다 기기 정보를 알리고, 에이전트 대화를 서버에서 돌려 어느 컴퓨터에서든 같은 대화를 이어 씁니다. 폰에서 보기도 같은 Tailscale 주소입니다.
  - 중계 서버: GitHub 없이 쓰는 사람의 피드백만 관리자 개인 저장소로 옮기는 작은 서버(Cloudflare Worker, `relay/`)입니다. 저장소에 쓰는 GitHub 키는 이 서버에만 있고 앱에는 없습니다.
- **공개.** 앱 저장소만 공개입니다.
  - 공개 글과 파일에는 실제 연구 이름 · 사람 이름 · 개인 이메일 · 로컬 경로를 쓰지 않습니다. 바깥 의견은 Issues · Discussions, 코드는 fork PR로 받고, 답은 관리자 승인 뒤에 게시합니다.
  - 내려받는 앱은 `docs/release-contract.md`의 계약을 지킵니다. 저장소 폴더 · 개발 도구 · 만든 기계의 경로 · 관리자의 서버나 계정에 기대지 않고, 관리자에게 무엇이든 보내는 기능은 사용자가 켜기 전에는 꺼 둡니다(`PRIVACY.md`). 릴리스에는 깨끗한 CI 기계에서 관문(`scripts/ci/release-gate.mjs`)을 통과한 파일만 붙고, 맥 dmg는 공증된 것만 붙습니다.
  - 업데이트: 설치판은 최신 릴리스를 확인해 자기 OS · 칩의 설치 파일을 안내하고, 저장소에서 돌리는 앱은 main을 받아 빌드합니다.

<!-- en -->
- **Repositories.** Every record is a plain text file a person can read, and git keeps the history, so nothing depends on the app.
  - App repository (public, MIT): app code, this About, format docs (`docs/`) and invented samples (`fixtures/`). `apps/server` is the app server running on your computer, `apps/web` the screens, `packages/core` the logic and API contracts both share, `desktop/` the desktop window (Tauri), and `relay/` the relay server.
  - Personal repository (private, one per user): raw feedback and its handling records (`feedback/`), requirements and the decision table (`planning/`), the shared rules for all research (`rules/research.md`), each computer's settings copy and device info (`_settings/<computer>/`), the home server info (`_settings/server.yaml`), and copies of agent conversations (`_chats/<computer>/`). You pick it in Account › Getting started, and the app keeps a copy in its settings folder.
  - Research repositories (one per project): manuscripts, notes and records. The app reads and writes `workbench/`, and it never moves a repository, it only registers its path. Format: `docs/repo-format.md`.
  - Library repository: concept notes, papers, figures, the shared LaTeX preamble (`preamble/`) and the bibliography, shared by all projects.
  - Account repositories of the installed app: an app installed from a download creates private repositories in your GitHub account when you sign in: settings and the project list (`emergence-workbench-home`), one per project, the library (`-library`) and paper PDFs (`-papers`). Another computer signed in to the same account pulls them and ends up in the same state.
- **Sync.** GitHub is the source of truth; computers pull and push to match it. In Settings › Sync each kind is Manual | Auto with its own interval.
  - Records and feedback are pushed soon after writing (30 seconds at first); research repositories and the library are pulled at the chosen interval.
  - Research whose git does not track `workbench/` is backed up to the personal repository every hour (the installed app pushes projects to its account repositories every 2 minutes).
  - Every hour each computer syncs with the personal repository and uploads its device info; your name, affiliation and commit name follow whichever computer changed them last. Sign-in keys and email are never uploaded.
  - When two computers changed the same file, it is merged three ways; when that fails, sync stops and says so. Nothing is deleted; the other copy is kept beside it.
  - Feedback reaches the maintainer in three ways. The maintainer's app pushes straight to `feedback/` in the personal repository. Other apps, after you press "Send to maintainer" once on the Feedback screen, send through the relay into `feedback/from/` in the maintainer's personal repository. When the relay is unavailable, you export a feedback file, hand it over by mail or chat, and the maintainer imports it. Handling records are written to `feedback/status.yaml` on the maintainer's side, and the app pulls them into the Feedback screen.
- **Accounts.** You sign in only on the Account page, opened by the account button below the rail.
  - GitHub: enter the code that "Sign in with GitHub" shows on GitHub. The key is kept only in this computer's secure store (the macOS keychain; on Windows a file locked to that Windows user). An existing `gh` or keychain sign-in is used as is.
  - Claude · Codex: the app uses this computer's Claude Code and Codex sign-ins, and you can add more accounts. Which account each kind of conversation uses is set in Settings › Agents.
  - Google (optional): the key stays on this computer; only screen settings and the project list go to the app's private space in Google Drive. Research file contents are never sent.
  - With a home server, Settings › Devices can sign another computer out (removing GitHub and Google sign-ins and added accounts; research files stay).
- **Servers.** Nothing depends on a server the maintainer runs. Storage is GitHub; work happens on your own computers.
  - App server: one per computer, running as a background service at `127.0.0.1:5174`. It reads and writes files and serves the API to the screens and to agents (MCP). The window only draws screens, so closing it does not stop agent conversations.
  - Home server (optional): in Settings › Devices you make one always-on computer the server. It is reachable only at a Tailscale address that links your own devices, never from the open internet. Other computers report their device info every minute, and agent conversations run on the server so you can continue the same conversation from any computer. On your phone uses the same Tailscale address.
  - Relay server: a small server (Cloudflare Worker, `relay/`) that only forwards feedback from people without GitHub into the maintainer's personal repository. The GitHub key it writes with lives only on that server, never in the app.
- **Public.** Only the app repository is public.
  - Public text and files never carry real research names, people's names, personal emails or local paths. Outside comments come through Issues and Discussions, code through fork PRs, and replies are posted after the maintainer approves.
  - Downloadable builds follow the contract in `docs/release-contract.md`: they do not rely on the source folder, developer tools, paths of the build machine, or the maintainer's servers or accounts, and anything that sends data to the maintainer stays off until the user turns it on (`PRIVACY.md`). Only files that passed the gate (`scripts/ci/release-gate.mjs`) on a clean CI machine are attached to a release, and only notarized Mac dmgs.
  - Updates: the installed app checks the latest release and offers the installer for its OS and chip; an app running from the repository pulls main and builds.

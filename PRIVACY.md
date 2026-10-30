# Privacy

[한국어](#한국어)

Emergence Workbench is a local app. It has no account with us, no server of ours, and no usage tracking. This page lists everything that leaves your computer and why.

## What stays on your computer

- The app server listens on `127.0.0.1` only. Other computers on your network cannot reach it.
- Settings live in `~/.config/research-workspace/`. Sign-in tokens there are readable by your user only.
- The app collects no analytics, crash reports or usage counts, and sends nothing to the app's maintainers.

## What leaves your computer, and only when you set it up

| Where it goes | What is sent | When |
| --- | --- | --- |
| Your git host (GitHub or another remote you choose) | Your research repositories, library and private records, with `git pull` and `git push` | When you add a project or a private repository, and the sync interval you pick in Settings › Sync (Manual is possible) |
| GitHub (this app's repository) | A `git fetch` to check for a new app version | Settings › Sync › update interval |
| Google (optional) | Sign-in, read-only calendar, and an app-only Drive folder holding app settings and the project list (repository addresses and tags). Never note or manuscript contents | Only after you connect a Google account in Settings › Accounts |
| arXiv, Semantic Scholar, Crossref, doi.org | Paper identifiers or titles you look up | When you add a paper or look up a person's papers |
| Your coding agent (Claude Code, Codex, …) | The notes, records and files the agent reads for a task you give it. The agent runs with your own sign-in and sends that content to its provider (Anthropic, OpenAI, …) under that provider's terms | Only when you ask an agent, or turn on an automatic agent setting |

Nothing else is sent. If you find a network call not listed here, please report it as a bug.

## Removing your data

Uninstall the app and delete `~/.config/research-workspace/`. Your research repositories are ordinary git repositories and stay where they are. To revoke Google access, disconnect in Settings › Accounts or at <https://myaccount.google.com/permissions>.

---

## 한국어

Emergence Workbench는 내 컴퓨터에서 도는 앱입니다. 우리 쪽 계정이나 서버가 없고, 사용 기록을 모으지 않습니다. 컴퓨터 밖으로 나가는 것을 모두 적습니다.

**컴퓨터 안에 남는 것:** 앱 서버는 `127.0.0.1`에서만 열려 같은 네트워크의 다른 컴퓨터도 들어오지 못합니다. 설정은 `~/.config/research-workspace/`에 있고, 로그인 토큰은 내 사용자만 읽을 수 있습니다. 사용 통계·오류 보고·사용 횟수를 모으지 않고, 앱 관리자에게 아무것도 보내지 않습니다.

**밖으로 나가는 것 (내가 설정했을 때만):**

| 보내는 곳 | 보내는 것 | 언제 |
| --- | --- | --- |
| 내 git 저장소(GitHub 등) | 연구 저장소 · 라이브러리 · 개인 기록 (`git pull`·`git push`) | 프로젝트나 개인 저장소를 더했을 때, 설정 › 동기화에서 고른 간격으로 (수동도 가능) |
| GitHub (이 앱 저장소) | 새 버전 확인용 `git fetch` | 설정 › 동기화 › 업데이트 간격 |
| Google (선택) | 로그인, 달력 읽기, 앱 전용 드라이브 폴더(앱 설정과 프로젝트 목록: 저장소 주소 · 태그). 노트 · 원고 내용은 보내지 않음 | 설정 › 계정에서 구글을 연결한 뒤에만 |
| arXiv · Semantic Scholar · Crossref · doi.org | 찾는 논문의 번호나 제목 | 논문을 더하거나 사람의 논문을 찾을 때 |
| 내 코딩 에이전트(Claude Code · Codex 등) | 맡긴 일에 에이전트가 읽는 노트 · 기록 · 파일. 에이전트는 내 로그인으로 돌고, 그 내용을 제공자(Anthropic · OpenAI 등)의 약관에 따라 보냄 | 에이전트에게 물었을 때, 또는 자동 에이전트 설정을 켰을 때만 |

이 밖에는 보내지 않습니다. 표에 없는 네트워크 연결을 찾으면 버그로 알려 주세요.

**지우기:** 앱을 지우고 `~/.config/research-workspace/`를 지웁니다. 연구 저장소는 평범한 git 저장소라 그대로 남습니다. 구글 권한은 설정 › 계정에서 연결을 끊거나 <https://myaccount.google.com/permissions>에서 거둡니다.

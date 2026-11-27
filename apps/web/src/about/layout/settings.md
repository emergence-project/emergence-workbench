---
id: settings
kind: reference
title: { ko: 설정과 계정, en: Settings and account }
summary:
  ko: 앱에 로그인한 나와 앱 전체의 설정입니다. 설정의 많은 부분은 컴퓨터마다 따로이고, 일부는 개인 저장소를 거쳐 맞춥니다.
  en: You, signed in, and the settings for the whole app. Much of it is per computer, and some is kept in step through the personal repository.
---
<!-- ko -->
- **정의** — 나의 것. 계정은 레일 아래 계정 단추, 설정은 레일 맨 아래 톱니바퀴에서 엽니다.
- **하위 요소**
  - **계정** (계정 단추 · 설정 › 계정) — 앱에 로그인한 나. 이름 · 소속과 GitHub · Claude 계정을 이어 둡니다.
  - **기기 관리** (설정 › 기기 관리) — 앱을 쓰는 컴퓨터들과 로그인을 맡는 서버.
  - **기능** (설정 › 기능) — 해 보는 중인 기능(지금은 흐름)을 이 컴퓨터에서 설치하거나 제거합니다. 제거해도 연구 파일은 남습니다.
  - **백업 · 동기화** (설정 › 백업 · 동기화) — 연구 저장소와 개인 저장소를 받고 올리는 간격.
  - **업데이트** (설정 › 앱 기본정보) — 새 버전 받기와 업데이트 이력.
- **저장 위치** — 이 컴퓨터의 앱 설정 폴더 `~/.config/research-workspace/`의 `config.yaml`(설치한 기능 `plugins:` 포함). 사본은 개인 저장소 `_settings/<컴퓨터>/`. 형식은 `docs/repo-format.md` §11.
- **자세히** — [설정](#/about/settings)

<!-- en -->
- **Definition**: your own things. The account opens from the account button below the rail, settings from the gear at the bottom of the rail.
- **Parts**
  - **Account** (account button · Settings › Account): you, signed in. Your name and affiliation, and your GitHub and Claude accounts, are linked here.
  - **Devices** (Settings › Devices): the computers you use the app on, and the server that handles sign-in.
  - **Features** (Settings › Features): install or remove features still being tried (now Flow) on this computer. Removing one leaves research files in place.
  - **Backup · sync** (Settings › Backup, Sync): how often research and personal repositories are pulled and pushed.
  - **Updates** (Settings › About the app): getting new versions, and the update history.
- **Where it is stored**: this computer's app settings folder `~/.config/research-workspace/`, in `config.yaml` (including installed features, `plugins:`). A copy goes to `_settings/<computer>/` in the personal repository. Format: `docs/repo-format.md` §11.
- **In detail**: [Settings](#/about/settings)

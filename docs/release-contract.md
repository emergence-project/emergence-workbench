# Release contract

[한국어](#한국어)

What every downloadable build of this app must satisfy before it reaches someone else's computer, and the check that enforces each rule. The rules are not specific to this app: any app that is built on a developer's machine and handed to other people can adopt the same contract and the same kind of gate.

The failure this contract prevents: an app that works on the machine that built it, because that machine has the source checkout, the developer tools, the developer's accounts and a warm cache, and fails or is blocked everywhere else.

## The rules

| # | Rule | Enforced by |
| --- | --- | --- |
| 1 | **The artifact is the product, not the checkout.** A release is a file built by CI. It runs without the source tree, git history, package managers or compilers, and contains no path of the machine that built it. | `scripts/ci/release-gate.mjs`: scans the bundle's text files for the build machine's home and checkout paths, then starts the bundled server from the installed (Windows) or dmg-extracted (Mac) copy with an empty home folder and a `PATH` without developer tools (`scripts/ci/desktop-smoke.mjs --standalone`). |
| 2 | **One version, decided once.** CI decides the release number in one step (`version` job in `.github/workflows/desktop.yml`) and passes it to everything that records it: the installer or app metadata and the server's `build.json`, which the update check compares with the latest release. Version fields in the repository (`tauri.conf.json`, `package.json`, `Cargo.toml`) are development placeholders. | The gate fails when `build.json` or the app metadata (Mac `Info.plist`, Windows file version) differs from the release number. |
| 3 | **Opens without workarounds.** On macOS the app is signed with a Developer ID, notarized and stapled; a Mac build that is not is never attached to a release, because Gatekeeper blocks it on every other Mac. Every Mac build is at least sealed (ad-hoc), so a test build is reported as "unverified developer", not "damaged". Windows installers are not signed yet; the "Windows protected your PC" prompt is documented in [install-windows.md](install-windows.md). | The gate always requires a sound bundle signature (`codesign --verify --deep --strict`) and records `trusted` (Developer ID + notarized + stapled). The release job attaches only Mac dmgs whose gate result is `ok` and `trusted`; with signing keys present the gate fails unless the build is trusted. |
| 4 | **Nothing reaches the maintainer by default.** A feature that sends anything to a server or account the maintainer controls is off until the user turns it on, and is listed in [PRIVACY.md](../PRIVACY.md). | `desktop-smoke.mjs` (run by the gate on the released files) fails if the feedback relay would send automatically on a fresh start. New maintainer-bound features add their own check there. |
| 5 | **Code and personal data live apart.** The repository and the bundle hold no one's private records; examples and fixtures are invented. The maintainer's private material lives in a separate private repository. | Code review, and rule 1's path scan for accidental local paths. |
| 6 | **A public channel and an update feed.** Releases are published on this public repository; the installed app checks the latest release and offers the installer for its own OS and chip (`apps/server/src/releaseCheck.ts`). Asset names carry no version, so `releases/latest/download/<name>` always points at the newest file. | The release job names the assets; `releaseCheck.test.ts` checks that each OS and chip finds its file. |
| 7 | **Checked on a clean machine before release.** Only files that passed the gate on a fresh CI runner are attached to a release. | `desktop.yml`: the `release` job runs after the gates and uploads only what passed. |

## How a release runs

1. Actions › **Desktop** › Run workflow with "release" on (or push a `v*` tag).
2. `version` decides the number. `windows` and `mac` build with that number; each Mac chip is built and launched on a runner of that chip (`macos-latest` for arm64, `macos-15-intel` for x64).
3. Windows: the NSIS installer is installed silently on the runner and the gate runs on the installed folder. Mac: the dmg is mounted, the app copied out, and the gate runs on that copy; if the build is trusted, the bundled server is started from a copy marked as downloaded (`com.apple.quarantine`).
4. `release` creates the tag and release and attaches the files that passed. If the Mac jobs fail, the Windows installer is still released; the Mac dmgs are left out.

The gate prints a table to the run's summary. To run it on a local build:

```sh
zsh scripts/make-desktop.sh --standalone        # or build a dmg with the Tauri CLI
node scripts/ci/release-gate.mjs --dmg "<file>.dmg" --launch [--version 0.3.3] [--require-trusted]
```

## Turning on Mac signing (maintainer)

This needs an Apple Developer Program membership. Add these repository secrets (Settings › Secrets and variables › Actions):

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | The "Developer ID Application" certificate with its private key, exported as `.p12` and base64-encoded (`base64 -i cert.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | The password chosen when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | The certificate's name, e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` | The Apple ID used for notarization |
| `APPLE_PASSWORD` | An app-specific password for that Apple ID (appleid.apple.com) |
| `APPLE_TEAM_ID` | The 10-character team ID |

With them, release runs sign the bundled native parts and the app, notarize and staple it, and the gate requires the result to be trusted. Pull request runs never sign or notarize (they build an ad-hoc test dmg). The signing path has not run yet; the first signed release run is its test, and a failure there releases no Mac file.

## Known gaps

- **git on a new Mac.** The Mac app does not carry git (the Windows installer carries MinGit). On a Mac without the Xcode Command Line Tools, macOS asks to install them the first time the app needs git, for example when creating a project. CI runners have the tools, so the gate cannot see this.
- **Windows signing.** Not signed; see [install-windows.md](install-windows.md).
- **Intel runners.** `macos-15-intel` is GitHub's last Intel runner (until 2027). Launching the x64 build on an Apple-silicon runner through Rosetta does not stand in for an Intel Mac (the server's git calls fail on arm64-only developer tools), so when that runner goes, decide whether to stop the x64 dmg or release it without the launch check.
- **Rule 4** is checked only for the feedback relay, the one maintainer-bound feature today. Once turned on, it has no switch to turn it off again.

---

## 한국어

이 앱의 내려받는 빌드가 다른 사람의 컴퓨터에 닿기 전에 지켜야 할 것과, 규칙마다 그것을 강제하는 검사. 이 앱만의 규칙이 아니라, 개발자의 컴퓨터에서 만들어 다른 사람에게 건네는 앱이라면 같은 계약과 같은 관문을 쓸 수 있다.

막으려는 실패: 만든 컴퓨터에는 소스 폴더 · 개발 도구 · 개발자 계정 · 데워진 캐시가 있어서 거기서는 되고, 다른 곳에서는 실패하거나 막히는 앱.

| # | 규칙 | 강제하는 것 |
| --- | --- | --- |
| 1 | **제품은 저장소 폴더가 아니라 CI가 만든 파일이다.** 소스 · git 이력 · 패키지 관리자 · 컴파일러 없이 돌고, 만든 기계의 경로를 담지 않는다. | `scripts/ci/release-gate.mjs`: 묶음의 글 파일에서 만든 기계의 집 폴더 · 저장소 경로를 찾고, 깐 폴더(윈도우) · dmg에서 꺼낸 앱(맥)의 묶은 서버를 빈 집 폴더와 개발 도구 없는 `PATH`로 켠다(`desktop-smoke.mjs --standalone`). |
| 2 | **판 번호는 한 번 정한다.** CI의 `version` 일이 정하고, 그 번호를 기록하는 모든 곳(설치 파일 · 앱 정보, 업데이트 확인이 쓰는 서버 `build.json`)에 넘긴다. 저장소의 번호 칸은 개발용 자리표시다. | `build.json`이나 앱 정보가 릴리스 번호와 다르면 관문 실패. |
| 3 | **우회 없이 열린다.** 맥은 Developer ID 서명 · 공증 · 스테이플. 그렇지 않은 맥 빌드는 릴리스에 붙이지 않는다(다른 맥에서 Gatekeeper가 막는다). 맥 빌드는 적어도 임시 서명으로 봉인해 "손상됨"이 아니라 "확인되지 않은 개발자"로 보이게 한다. 윈도우는 아직 서명하지 않고 "PC 보호" 창을 안내한다. | 관문은 늘 묶음 서명이 온전한지 보고 `trusted`(Developer ID + 공증 + 스테이플)를 적는다. 릴리스는 `ok`이고 `trusted`인 dmg만 붙인다. 서명 열쇠가 있으면 trusted가 아닐 때 관문이 실패한다. |
| 4 | **기본값으로 관리자에게 아무것도 가지 않는다.** 관리자의 서버 · 계정으로 무엇이든 보내는 기능은 사용자가 켜기 전에는 꺼져 있고 PRIVACY.md에 적혀 있다. | 관문이 받은 파일에 돌리는 `desktop-smoke.mjs`가, 처음 켠 앱이 피드백을 저절로 보내려 하면 실패한다. 관리자에게 가는 기능을 새로 만들면 거기에 검사를 더한다. |
| 5 | **코드와 개인 기록은 따로 둔다.** 저장소와 묶음에 누구의 개인 기록도 없고, 예제는 지어낸 것이다. 관리자의 개인 자료는 별도 비공개 저장소에 있다. | 코드 검토, 그리고 1의 경로 검사. |
| 6 | **공개 채널과 업데이트 피드.** 릴리스는 이 공개 저장소에 내고, 설치한 앱은 최신 릴리스를 보고 자기 OS · 칩의 설치 파일을 알린다(`releaseCheck.ts`). 파일 이름에 번호를 넣지 않아 `releases/latest/download/<이름>`이 늘 최신을 가리킨다. | 릴리스 일이 이름을 붙이고, `releaseCheck.test.ts`가 OS · 칩마다 파일을 찾는지 본다. |
| 7 | **내기 전에 깨끗한 기계에서 본다.** CI 새 기계에서 관문을 통과한 파일만 릴리스에 붙는다. | `desktop.yml`의 `release` 일. |

**맥 서명 켜기(관리자):** Apple Developer Program 가입이 필요하다. 위 영어 절의 표대로 저장소 비밀값 여섯 개를 넣으면 릴리스 실행이 묶음 안의 네이티브 부품과 앱을 서명하고 공증 · 스테이플하며, 관문이 trusted를 요구한다. PR 실행은 서명 · 공증하지 않는다. 서명 경로는 아직 한 번도 돌지 않았다: 첫 서명 릴리스가 그 시험이고, 거기서 실패하면 맥 파일은 나가지 않는다.

**알려진 빈틈:** 맥 앱은 git을 품지 않아(윈도우는 MinGit을 품는다) Xcode 명령줄 도구가 없는 맥에서는 처음 git이 필요할 때(프로젝트 만들기 등) macOS가 설치를 묻는다. CI 기계에는 도구가 있어 관문이 보지 못한다. 윈도우 서명 없음. x64 dmg는 GitHub의 마지막 인텔 기계(`macos-15-intel`, 2027년까지)에서 만들고 켜 본다. arm64 기계에서 Rosetta로 켜면 인텔 맥을 대신하지 못한다(서버가 부르는 git이 arm64 전용 명령줄 도구를 읽지 못한다). 규칙 4는 오늘 관리자에게 가는 유일한 기능인 피드백 중계만 검사하고, 한 번 켜면 다시 끄는 스위치가 아직 없다.

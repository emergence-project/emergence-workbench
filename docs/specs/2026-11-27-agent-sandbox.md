# 설계: 연구 대화의 명령을 OS 격리 안에서

2026-11-27 · 상태: 사용자 승인("격리로", 11/27), 구현 · 범위: 앱 안 Claude 대화(연구 프로젝트 · 지식 · 중앙)의 Bash 명령

## 1. 왜

명령 판정(`agentPolicy.ts` · `chat-auto.ts`)은 명령 글을 읽어 묻거나 지나가게 한다. 11/27 앱 전체 보안 검토에서 판정을 고칠 때마다 별도 검토가 비켜 가는 꼴을 찾았다(링크 · 무늬 · 줄 안의 `cd` · 붙여 쓴 옵션 · git 설정 · 비밀 파일 이름). 글을 읽는 판정은 막을 꼴에 끝이 없다(`2026-11-26-command-verdict-read-fully.md`). 일반 사용자에게 앱을 내보내려면, 판정이 놓친 명령도 작업 폴더 밖을 쓰거나 비밀을 읽지 못하게 하는 벽이 있어야 한다. 그 벽이 OS 격리다.

판정은 그대로 둔다: 무엇을 할지 사용자에게 묻는 일(삭제 · 외부 · 실행)은 판정이, 판정이 놓친 것을 막는 일은 격리가 한다.

## 2. 범위

- **넣는 곳:** 앱 안 Claude 대화 가운데 앱 고치기가 아닌 것(연구 프로젝트 · 지식 · 중앙).
- **넣지 않는 곳:** 앱 고치기 대화(화면 그림 서버의 유닉스 소켓 · `pnpm` 잠금 · `gh` 인증서가 격리 안에서 막힌다, 11/26 시험 §8). Codex 대화(다른 길(ACP)로 돈다, 따로 본다).
- **운영체제:** 에이전트 라이브러리의 `sandbox` 옵션이 맥(Seatbelt) · 리눅스(bwrap) · 윈도우(다른 사용자로 돌림)를 맡는다. 맥만 시험했다. 격리를 띄우지 못하는 곳(리눅스에 bwrap이 없음 등)은 `failIfUnavailable: false`로 판정만으로 돈다.
- **끄기:** 서버 환경 변수 `RW_AGENT_SANDBOX=0` (문제가 생긴 컴퓨터에서 원인을 가를 때).

## 3. 설정 (`apps/server/src/agentSandbox.ts`)

| 칸 | 값 | 까닭 |
| --- | --- | --- |
| `autoAllowBashIfSandboxed` | false | 판정은 명령마다 계속 본다 |
| `allowUnsandboxedCommands` | false | 에이전트가 `dangerouslyDisableSandbox`로 격리를 끄지 못하게 |
| 쓰기 | 작업 폴더와 임시 폴더(라이브러리 기본) | |
| `allowWrite` | 작업 폴더가 git worktree면 그 git 폴더와 본체 | 커밋이 쓴다 |
| `denyWrite` | git의 `hooks` · `config` · `config.worktree`, `core.hooksPath`에 적힌 폴더, 함께 읽는 폴더 | 훅 · 설정은 git이 실행한다. 함께 읽는 폴더는 `additionalDirectories`로 주면 쓰기가 열린다 |
| `denyRead` | 앱 설정 폴더(대화 기록 · 계정 · 열쇠), `~/.ssh` · `~/.gnupg` · `~/.aws` · `~/.config/gh` · `~/.netrc` · `~/.git-credentials` · `~/.docker/config.json` · `~/.kube` · `~/.claude/.credentials.json` · `~/.codex/auth.json` · `~/Library/Keychains` | 나머지 홈은 열어 둔다: TeX · 파이썬 · 글꼴이 읽는 곳을 다 찾기 어렵다 |
| `credentials.envVars` deny | `RW_KEY` · `GITHUB_TOKEN` · `GH_TOKEN` · `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` · `CLAUDE_CODE_OAUTH_TOKEN` · `GOOGLE_API_KEY` · `HF_TOKEN` | 에이전트 프로세스는 서버의 환경을 물려받는다 |

**네트워크.** 격리 안의 명령이 새 호스트로 나가면 라이브러리가 `canUseTool('SandboxNetworkAccess', { host })`를 부른다. 판정(`judgeNet`)은 「웹 보기」 토글이 켜져 있으면 지나가게 하고, 꺼져 있으면 「인터넷 · 호스트」로 묻는다. 「늘」은 그 호스트만 허락한다(`net:<호스트>`). 명령 자체는 판정이 이미 허락한 뒤라, 여기서는 어디로 나가는지만 본다.

## 4. 시험 (2026-11-27, 맥, SDK 0.3.291, 버린 시험)

정해 둔 명령을 실제 에이전트가 격리 안에서 돌렸다. 시험 폴더는 홈 아래 임시 폴더(임시 폴더 안이면 격리가 쓰기를 열어 둬 시험이 되지 않는다)에 만들고 끝에 지웠다. 마지막 시험은 이 설정 함수가 만든 값 그대로 했다(작업 폴더 = git worktree, 함께 읽는 폴더 하나, 환경에 시험용 토큰).

| 본 것 | 결과 |
| --- | --- |
| 홈 · 옆 폴더에 쓰기 (셸 · 파이썬) | 막힘 |
| 프로젝트 안의 링크로 밖 파일에 쓰기 | 막힘 |
| 함께 읽는 폴더에 쓰기 / 읽기 | 막힘 / 됨 (`denyWrite`가 없으면 쓰기가 열렸다) |
| git 본체의 `hooks` 쓰기 · `git config` 쓰기 (worktree에서 `git rev-parse --git-common-dir`로 찾아가도) | 막힘 |
| 커밋 (보통 저장소 · worktree) | 됨 |
| 앱 설정 폴더 읽기 | 막힘 |
| 환경의 토큰 (`GH_TOKEN`) | 명령에 보이지 않음 |
| 그 밖의 홈 읽기 (`~/Documents`) | 열려 있음 |
| xelatex(앱 기본 엔진)으로 PDF 만들기 | 됨 |
| python 파일 쓰기 · venv 만들기 | 됨 |
| pip 설치 | 호스트를 앱에 묻고, 허락하면 됨 (캐시는 꺼짐 경고) |
| 모르는 호스트 (curl) | 앱에 묻고, 거절하면 막힘 |
| `mktemp` (맥의 사용자 임시 폴더 `/var/folders/…`) | 막힘. `TMPDIR`은 격리용 폴더로 바뀌어 파이썬은 됨 |

## 5. 남은 것

1. 맥의 사용자 임시 폴더(`/var/folders/…/T`) 쓰기: 열면 `mktemp`가 되지만 다른 앱의 임시 파일도 거기 있다. 지금은 닫아 둔다. 막혀서 깨지는 도구가 보이면 연다.
2. 홈 읽기를 더 막을지: 지금은 비밀이 든 곳만. 문서 폴더 같은 개인 파일도 막으려면 TeX · 파이썬이 읽는 곳을 열어 주는 목록이 필요하다.
3. 앱 고치기 대화 · Codex 대화 · 리눅스 · 윈도우: 각각 시험한 뒤 넣는다.
4. 앱이 대신 돌리는 컴파일(서버의 latexmk)은 격리 밖이다. 앱은 shell-escape를 켜지 않아 TeX 기본(`shell_escape = p`, 정해 둔 명령만)으로 돈다. 남이 준 원고를 컴파일하는 길도 격리할지는 따로 본다.
5. 격리를 켜고 끄는 화면 설정: 지금은 환경 변수뿐이다.

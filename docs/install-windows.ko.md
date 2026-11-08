# 윈도우에 설치하기

윈도우 10 · 11(64비트)용 설치 파일이 있습니다. 서버 · 화면 · Node · git을 모두 품고 있어 따로 깔 것이 없습니다.

## 설치

1. [릴리스 쪽](https://github.com/emergence-project/emergence-workbench/releases/latest)의 **Assets**에서 `Emergence Workbench_<번호>_x64-setup.exe`를 받습니다.
2. 받은 파일을 엽니다. 서명하지 않은 설치 파일이라 윈도우가 **"Windows의 PC 보호"** 창을 띄웁니다. **추가 정보**를 누른 뒤 **실행**을 누릅니다.
3. 설치는 내 계정에만 하므로 관리자 권한을 묻지 않습니다. 끝나면 시작 메뉴와 바탕화면에 **Emergence Workbench**가 생깁니다.

처음 열면 빈 작업대가 뜹니다. 홈의 **＋ 프로젝트 등록** › **새로 만들기**로 첫 프로젝트를 만들거나, 설정 › 계정 › 시작 준비에서 GitHub에 로그인해 있는 저장소를 가져옵니다.

## 알아 둘 것

- **앱이 하는 일:** 창을 열면 앱 안의 서버가 `http://127.0.0.1:5174`에서 켜지고, 창을 닫으면 함께 꺼집니다. 이 컴퓨터 밖에서는 이 주소에 들어올 수 없습니다. 무엇을 바깥에 보내는지는 [PRIVACY.md](../PRIVACY.md)에 있습니다.
- **설정과 기록:** `C:\Users\<이름>\.config\research-workspace\`. 서버 기록은 `%LOCALAPPDATA%\io.github.emergence-project.workbench\logs\server.log`.
- **여러 컴퓨터에서 같은 상태로:** 설정 › 계정에서 GitHub로 로그인하면 **계정 동기화**가 이 컴퓨터의 프로젝트 · 공용 라이브러리 · 논문 PDF를 내 계정의 비공개 저장소에 2분마다 올립니다(프로젝트마다 하나, `emergence-workbench-library` · `-papers` · 설정과 프로젝트 목록을 두는 `-home`). 다른 컴퓨터에서 같은 계정으로 로그인하면 그 프로젝트를 모두 받아 등록하고, 그 뒤 고친 것은 서로 저절로 받습니다. 95MB가 넘는 파일은 GitHub가 받지 않아 그 컴퓨터에만 남습니다. 여럿이 함께 쓰는 컴퓨터에서는 쓰고 난 뒤 로그아웃하세요(열쇠가 지워집니다).
- **git:** 앱에 작은 git(MinGit)이 들어 있습니다. Git for Windows를 따로 깔았으면 그것을 씁니다.
- **에이전트:** 앱 안 에이전트는 이 컴퓨터에 깐 Claude Code(`claude`)를 씁니다. 없으면 에이전트 기능만 꺼지고 나머지는 그대로 됩니다.
- **원고 컴파일(PDF):** TeX가 있어야 합니다(MiKTeX 또는 TeX Live). 원고 서식은 맥 글꼴 이름을 쓰므로 윈도우에서는 글꼴을 바꿔야 할 수 있습니다.
- **업데이트:** 아직 앱이 스스로 받지 않습니다. 새 릴리스의 설치 파일을 받아 같은 방법으로 설치하면 덮어씁니다(설정과 프로젝트는 그대로).
- **지우기:** 설정 › 앱 › 설치된 앱에서 Emergence Workbench를 제거합니다. 설정 폴더와 프로젝트 폴더는 남습니다.

## 만드는 쪽 (관리자)

설치 파일은 GitHub Actions의 윈도우 기계가 만듭니다(`.github/workflows/desktop.yml`).

- 시험: Actions › Desktop (Windows) › Run workflow. 산출물 `windows-installer`(설치 파일)와 `windows-shots`(윈도우에서 찍은 화면).
- 내놓기: Actions 화면 › **Desktop (Windows) › Run workflow**에서 「릴리스로 내기」를 켜고 돌립니다(버전을 비우면 다음 번호). 그 실행이 설치 파일을 만들고 그 커밋에 태그와 릴리스를 만들어 설치 파일을 붙입니다. 태그를 올리지 못하는 클라우드 에이전트도 이 실행은 돌릴 수 있습니다. `v`로 시작하는 태그를 직접 올려도 같습니다.
- 서명: 지금은 서명하지 않습니다. "PC 보호" 창을 없애려면 코드 서명 인증서가 필요합니다(예: Microsoft Trusted Signing, 한 달 약 10달러). 서명을 붙이면 이 절을 고칩니다.

# research-library

Emergence Workbench의 **공유 라이브러리** 틀. 여러 연구가 함께 쓰는 것을 둔다. 비공개 저장소로 두는 것을 권한다.

이 틀에는 서식(`preamble/`)만 있다. 개념노트·논문·그림은 앱에서 더하면 생긴다. 폴더 형식은 `docs/repo-format.md` §10.

## preamble/ — 공통 서식

연구를 등록할 때 체크로 골라 그 연구의 `workbench/preamble.tex`가 불러오게 한다.

| 파일 | 내용 | 순서 |
| --- | --- | --- |
| `base.tex` | 한글 글꼴, 여백, 수식·정리·그림 패키지 | 맨 앞 |
| `theorems.tex` | 정의·정리·보조정리 등 환경 | 연구 서식 뒤 |
| `quantum-info.tex` | 자주 써서 줄여 치는 양자정보 기호만: `\Tr`, `\ket`, `\bra`, `\proj`. 나머지는 직접 친다 | 연구 서식 뒤 |

**순서 규칙.** 기본 패키지(`place: first`) → 그 연구 저장소의 서식 → 라이브러리 기호·환경(`place: last`). 라이브러리 기호는 `\providecommand`로, 환경은 "없을 때만" 만든다. 그래서 연구마다 뜻이 다른 기호는 **연구 전용 서식이 항상 이긴다.**

**고칠 때 주의.** 이 파일을 고치면 이 파일을 쓰는 모든 연구의 PDF가 바뀐다. 한 연구에만 필요한 기호는 그 연구 저장소에 둔다.

**경로.** 연구 파일은 `\input{preamble/base.tex}`처럼 라이브러리 안 경로만 적는다. 이 라이브러리가 어디 있는지는 연구 작업대의 로컬 설정(`~/.config/research-workspace/config.yaml`의 `library`)이 알려 준다. 그래서 다른 컴퓨터에서도 연구 파일을 고치지 않고 쓸 수 있다.

머리말(`% ---` 사이)의 `title`·`description`은 등록 창에 보이는 이름과 설명, `place`는 불러오는 순서다.

# LaTeX 서식 파일

설정 › LaTeX 서식의 서식이 함께 쓰는 스타일 파일이다. 서식에서 받을 때 main.tex·setting.tex 옆에 함께 둔다.

| 파일 | 서식 | 원본 |
|---|---|---|
| `rw-research-note.sty` | 연구노트 (rw-research-note) | 기본 연구노트 서식. 머리말에 문서 제목. 이 파일이 정본 |

앱에 싣지 않는 스타일 파일(공개하지 않는 발표 테마 등)은 앱 설정 폴더의 `latex-files/`에 두고, `config.yaml`의 그 서식에 `files: [이름.sty]`로 적는다. 앱은 이 폴더를 먼저, 없으면 `latex-files/`를 찾는다.
발표 서식(beamer)은 테마 없이 XeLaTeX로 컴파일하고 `fontspec`, `kotex`, `unicode-math`를 공통 줄에서 부른다.

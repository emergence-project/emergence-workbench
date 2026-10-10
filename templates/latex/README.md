# LaTeX 서식 파일

설정 › LaTeX 서식의 서식이 함께 쓰는 스타일 파일이다. 서식에서 받을 때 main.tex·setting.tex 옆에 함께 둔다.

| 파일 | 서식 | 원본 |
|---|---|---|
| `knowledge-factory-beamer.sty` | 발표 (beamer) | `emergence-project/knowledge-factory`의 `templates/knowledge-factory-beamer/` v0.1.1 (커밋 6e5562b) |
| `rw-research-note.sty` | 연구노트 (rw-research-note) | 기본 연구노트 서식. 머리말에 문서 제목. 이 파일이 정본 |

beamer 파일은 원본 저장소가 정본이다. 여기서 고치지 말고, 원본이 바뀌면 그대로 다시 복사한다.
발표 서식은 XeLaTeX로 컴파일하고 `fontspec`, `kotex`, `unicode-math`를 먼저 불러야 한다 (서식의 공통 줄에 들어 있다).

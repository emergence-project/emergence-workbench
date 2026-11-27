---
id: library
kind: reference
title: { ko: 라이브러리, en: Library }
summary:
  ko: 프로젝트와 상관없이 여러 연구가 함께 쓰는 지식 · 논문 · 그림입니다. 라이브러리 저장소 하나에 있어 한 곳에서 고치면 쓰는 모든 연구에 반영됩니다.
  en: Knowledge, papers and figures that several projects share. They live in one library repository, so a change in one place reaches every project that uses it.
---
<!-- ko -->
- **정의** — 프로젝트 밖에서 모든 연구가 함께 쓰는 자료. 레일에 지식 · 논문 · 그림이 하나씩 있습니다.
- **하위 요소**
  - **지식 · 개념노트** (레일 › 지식) — 개념노트는 여러 연구가 다시 쓰는 지식 하나입니다. 지식 화면에서 찾고 읽고 고치며, 개념노트 사이의 링크를 그린 지식 지도도 여기 있습니다.
  - **공부** (지식 › 공부) — 책 · 강의 하나의 장을 따라가며 개념노트를 키웁니다.
  - **논문 · 문헌노트** (레일 › 논문) — 라이브러리의 논문과 책, PDF. 문헌노트는 논문 하나의 정리이고, 논문에 단 코멘트와 추천 논문도 여기 있습니다.
  - **그림** (레일 › 그림) — 노트에서 함께 쓰는 tikz · svg 그림. 프로젝트 그림이 같은 이름의 공용 그림보다 앞섭니다.
  - **분류** — 지식 · 논문 · 그림에 함께 쓰는 분류 나무. 항목마다 분류 1–3개를 붙입니다.
- **저장 위치** — 앱 설정의 `library:`가 가리키는 라이브러리 저장소. 개념노트 `concepts/`, 문헌노트 `papers/`와 목록 `papers.yaml`, 참고문헌 `references.bib`, 그림 `figures/`, 공부 `study/`, 분류 `subjects.yaml`, 공용 서식 `preamble/`, 개념노트 기록 `workbench/comments/`. 형식은 `docs/repo-format.md` §10.
- **자세히** — [개념노트](#/about/knowledge) · [참고 자료와 논문 읽기](#/about/reading)

<!-- en -->
- **Definition**: material outside projects that all research shares. Knowledge, Papers and Figures each have a place on the rail.
- **Parts**
  - **Knowledge · concept notes** (Rail › Knowledge): a concept note is one piece of knowledge reused across projects. The Knowledge screen finds, reads and edits them, and the knowledge map of links between them is here too.
  - **Study** (Knowledge › Study): grow concept notes by following the chapters of one book or lecture.
  - **Papers · literature notes** (Rail › Papers): papers, books and PDFs in the library. A literature note summarizes one paper; paper comments and recommended papers are here too.
  - **Figures** (Rail › Figures): tikz and svg figures shared across notes. A project figure wins over a shared figure of the same name.
  - **Subjects**: one subject tree shared by knowledge, papers and figures. Each item carries one to three subjects.
- **Where it is stored**: the library repository that the `library:` setting points to. Concept notes in `concepts/`, literature notes in `papers/` with the list `papers.yaml`, the bibliography `references.bib`, figures in `figures/`, study in `study/`, subjects in `subjects.yaml`, shared LaTeX headers in `preamble/`, concept-note records in `workbench/comments/`. Format: `docs/repo-format.md` §10.
- **In detail**: [Concept notes](#/about/knowledge) · [Reference materials and reading papers](#/about/reading)

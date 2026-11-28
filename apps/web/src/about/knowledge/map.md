---
id: map
title: { ko: 지식 지도, en: Knowledge map }
summary:
  ko: 지식 사이드바 「지도」. 개념 하나가 점 하나이고, 점 색은 분야, 점 모양은 노트 상태입니다. 전체 지도와 초점 보기 둘뿐이고, 점을 누르면 오른쪽에 미리 봅니다.
  en: '"Map" in the Knowledge sidebar. Each concept is one dot; the dot color is its field and the dot shape its note status. There are only two views, the full map and focus, and clicking a dot previews it on the right.'
code:
  - apps/web/src/KnowledgeMap.tsx
  - apps/web/src/KnowledgeGraph.tsx
  - apps/web/src/knowledgeGraph.ts
  - apps/web/src/styles/knowledge-map.css
  - packages/core/src/field-colors.ts
---
<!-- ko -->
- **전체 지도.** 모든 개념이 점 하나씩입니다. 분야(분류의 맨 위)마다 군집이 저절로 떨어져 놓이고, 연결된 점은 군집 안에서 서로 당깁니다. 자리는 저장하지 않고 같은 자료면 늘 같은 자리입니다. 군집을 끌어 옮기거나 분야 이름을 지도에 쓰지 않습니다.
- **점.** 색 = 분야, 모양 = 노트 상태, 크기 = 연결 수입니다. 연결 없는 개념(어느 쪽으로도 다른 개념과 링크가 없음)은 흐리게 자기 군집 둘레에 떠 있습니다. 선은 본문 [[링크]]와 `related`이고 방향 없이 하나입니다(서로 링크해도 선 하나).
  - 모양: 확인함 고리 안 점 · 확인 전 꽉 찬 점 · 작업 중 마름모(빈 절 · TODO) · 빈 노트 빈 고리(제목 · 틀뿐) · Study 원료만 빈 네모. 앱이 이미 하는 판단(확인 · 미완성)을 그대로 씁니다.
- **이름과 미리 보기.** 전체 지도에는 이름을 쓰지 않습니다. 점을 가리키면 이름 · 상태 · 분야 · 연결 수 팝업, 누르면 이웃만 진해지고 오른쪽 사이드바 「정보」에 미리 보기(요약 · 열기 · 초점 보기 · 이웃 · 쓰는 프로젝트), 두 번 누르면 초점 보기입니다.
- **초점 보기.** 고른 개념을 가운데에 두고 이웃(한 단계) 또는 이웃의 이웃(두 단계)만 그립니다. 가운데와 바로 이웃만 이름을 씁니다. 머리줄의 「전체 지도 › … › 개념」으로 돌아갑니다.
- **툴바.** 조작은 지도 위 가운데 둥근 툴바 하나에 모았습니다(PDF 툴바와 같은 모양): 개념 찾기 · 이웃 / 두 단계(초점 보기만) · − 비율 ＋ · 화면에 맞추기 · 분야 색. 확대는 맞춘 크기의 약 80%–370%로 묶고, 휠 · 트랙패드는 움직인 양만큼만 바뀝니다. 끝에 닿으면 그쪽 버튼이 흐려집니다.
- **범례.** 지도 아래 한 띠에 분야 · 점 색 | 상태 · 점 모양 | 읽는 법. 오른쪽 위 ⌄로 접으면 한 줄(분야 색 점 · 모양 · 흐린 점)만 남고, 그 줄을 누르면 펼칩니다. 폰 폭에서는 접힌 채로 시작합니다.
- **분야 색.** 툴바 「분야 색」은 분야 목록만 보이고, 분야를 누르면 그 분야 아래에 색 12개가 펼쳐집니다. 다른 분야가 쓰는 색에는 흰 점이 있고 누르면 두 분야의 색을 맞바꿉니다(같은 색 둘은 생기지 않음). 고른 색은 라이브러리 `subjects.yaml` 맨 위 분류의 `color:`에 적혀 모든 컴퓨터가 같은 색을 봅니다. 분류 나무가 없으면 이 버튼이 없고 기본 색만 씁니다.
### 지킬 것
- 보기는 전체 지도와 초점 보기 둘만 둡니다. 거르기 · 다른 보기를 더하지 않습니다.
- 점 색은 「색은 상태에만」의 예외이고 지도 점에만 씁니다(토큰 `--field-*`). 주황 · 빨강 · 노랑은 쓰지 않습니다.
- 그리기는 sigma.js(WebGL) · graphology · d3-force(MIT · ISC)를 의존성으로 씁니다. 고쳐 쓴 사본(fork)을 두지 않습니다.
### 결정
- 2026-11-28 카드에 개념 이름을 박던 지도를 옵시디언식 점 그래프로 바꿈. 보기는 전체 · 초점 둘, 점 색 = 분야(디자인 기준의 예외), 점 모양 = 노트 상태, 이름은 팝업 · 오른쪽 미리 보기, 초점 보기는 가운데와 바로 이웃만 이름, 범례는 지도 아래 띠(설계 결정 6개 모두 추천대로).
- 2026-11-28 분야 이름을 지도에 쓰지 않고 군집도 옮기지 않음("자유도가 너무 높으면 조작이 복잡해진다"). 확대에 한계, 조작은 위 툴바 하나, 범례는 접기, 분야 색은 맞바꾸기.
<!-- en -->
- **Full map.** Every concept is one dot. Each field (the top of the subject tree) forms its own cluster, placed apart automatically; linked dots pull together inside a cluster. Positions are not saved: the same data always lands in the same place. Clusters are not dragged and field names are not written on the map.
- **Dots.** Color = field, shape = note status, size = number of links. Unlinked concepts (no link to or from another concept) float faded around their own cluster. Lines are text [[links]] and `related`, one undirected line per pair (a mutual link is still one line).
  - Shapes: reviewed ring with dot · not reviewed filled dot · in progress diamond (empty sections · TODO) · empty note hollow ring (title or outline only) · Study material only hollow square. They reuse the app's existing judgments (review · unfinished).
- **Names and preview.** The full map shows no names. Hover a dot for a popup with name, status, field and link count; click it to highlight its neighbors and preview it under "Info" in the right sidebar (summary · open · focus · neighbors · projects using it); double-click to focus.
- **Focus.** The chosen concept sits in the middle with its neighbors (one step) or neighbors of neighbors (two steps). Only the center and direct neighbors are named. "Full map › … › concept" in the header goes back.
- **Toolbar.** All controls sit in one rounded toolbar floating at the top center of the map (the same shape as the PDF toolbar): find a concept · neighbors / two steps (focus only) · − ratio + · fit to screen · field colors. Zoom is limited to about 80%–370% of the fitted size, and the wheel or trackpad changes it only as much as you move. At either end that button fades.
- **Legend.** One strip under the map: field · dot color | status · dot shape | how to read. The ⌄ at its top right folds it to one line (field color dots · shapes · faded dot); click that line to unfold. At phone width it starts folded.
- **Field colors.** "Field colors" in the toolbar shows only the list of fields; click a field to open its 12 colors. A color another field uses carries a white dot, and clicking it swaps the two fields' colors (no two fields share a color). The chosen color is written as `color:` on the top-level subject in the library's `subjects.yaml`, so every computer sees the same colors. Without a subject tree the button is hidden and default colors are used.
### Keep
- Only two views, the full map and focus. Do not add filters or other views.
- Dot color is an exception to "color only for status" and is used only for map dots (tokens `--field-*`). No orange, red or yellow.
- Drawing uses sigma.js (WebGL), graphology and d3-force (MIT · ISC) as dependencies. Do not keep a modified copy (fork).
### Decisions
- 2026-11-28 The map that stamped concept names on cards became an Obsidian-style dot graph. Two views, full and focus; dot color = field (an exception to the design rule); dot shape = note status; names in a popup and the right preview; focus names only the center and direct neighbors; the legend is a strip under the map (all six design decisions as recommended).
- 2026-11-28 No field names on the map and no moving clusters ("too much freedom makes it complicated"). Zoom has limits, controls sit in one top toolbar, the legend folds, and field colors swap.

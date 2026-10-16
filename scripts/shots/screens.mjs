// 편집기에 글이 들어올 때까지 기다린다 (편집기 틀만 먼저 그려진다)
const EDITOR_TEXT = '[data-ui="LaTeX 편집기"] .cm-line:not(:has(br:only-child))'

/** 찍을 화면: [파일 이름, 주소(#뒤), 그려졌다고 볼 부위(data-ui, '['로 시작하면 선택자), 찍기 전에 누를 부위(data-ui 또는 그 목록, 없어도 됨)] — {rid}는 예제 연구 id.
 *  이름이 `dark-`로 시작하면 다크 모드(시스템 설정 흉내)로 찍는다. --theme dark면 모든 화면을 다크로 찍는다(다크 값을 고칠 때 확인용). */
export const DEFAULT_SCREENS = [
  ['home', '#/', '홈'],
  // 홈 카드 보기 (10/5 시안 5단계). 보기는 기억되므로 목록 보기(home)보다 뒤에 둔다
  ['home-cards', '#/', '프로젝트 카드', '[data-ui="보기 고르기"] button:text-matches("^(카드|Cards)")'],
  ['search', '#/', '검색 창', '검색 버튼'],
  ['project', '#/r/{rid}', '최근 손댄 노트'],
  // 첫 화면 머리의 연필: 이름 · 설명 · 성격 · 분야 · 진행 상태 고치기 (5단계)
  ['project-edit', '#/r/{rid}', '프로젝트 고치기 칸', '프로젝트 고치기'],
  // 주제 화면 (10/5 시안 3단계): 노트 카드 격자, 주제 고치기 창, 주제 없는 노트("노트들")
  ['topic', '#/r/{rid}/t/coloring', '노트 카드 목록'],
  // 연구 흐름 (10/14, 프로젝트 하나에 한 흐름): 주제 필터로 한 주제를 굵게, 점을 눌러 아래에 자세히 (점 파일은 fixtures/sandbox-extra/workbench/flow)
  ['flow', '#/r/{rid}/flow?topic=coloring', '흐름 점 자세히', '[data-ui="흐름 차트"] .fl-node[data-id="five-color-theorem"]'],
  ['topic-edit', '#/r/{rid}/t/coloring', '주제 고치기 창', '주제 고치기'],
  ['loose-notes', '#/r/{rid}/t/__loose', '노트 카드 목록'],
  // 흐름 점 고치기 창 (2단계). 고른 점은 기억되므로 자세히의 연필을 바로 누른다. 같은 주소의 창이 남지 않게 다른 주제 화면 뒤에 둔다
  ['flow-edit', '#/r/{rid}/flow', '흐름 점 고치기 창', '흐름 점 고치기'],
  // 설명 칸의 그림 ▾ (10/16): 컴퓨터에서 · 그림 라이브러리에서 고르기
  ['flow-edit-figure', '#/r/{rid}/flow', '흐름 그림 메뉴', ['[data-ui="흐름 차트"] .fl-node[data-id="kempe-swap"]', '흐름 점 고치기', '흐름 그림 넣기']],
  ['notes', '#/r/{rid}/notes', '원고 목록'],
  // 새 점 (10/16 승인 "이어서 · 지정 · 새로 시작"): 창 없이 차트의 점선 점 + 자세히 자리의 새 점 칸. 같은 주소면 앞 화면의 칸이 남으므로 다른 탭 화면 뒤에 하나씩 둔다
  ['flow-new', '#/r/{rid}/flow', '흐름 새 점 창', ['[data-ui="흐름 차트"] .fl-node[data-id="kempe-swap"]', '흐름 다음 점']],
  // 작업 탭 (10/7 시안 v31): 처음은 판단 필터(브리핑 · 한 주 달력 · 판단 카드). 맡긴 일은 fixtures/sandbox-extra/workbench/tasks
  ['todo', '#/r/{rid}/todo', '판단 카드'],
  ['flow-pick', '#/r/{rid}/flow', '흐름 앞선 점 고르기', ['[data-ui="흐름 차트"] .fl-node[data-id="kempe-swap"]', '흐름 다음 점 메뉴', '[role="menuitem"]:text-matches("^(앞선 점|Choose several)")', '[data-ui="흐름 차트"] .fl-node[data-id="five-color-theorem"]']],
  // 기록 탭 (10/15): 메모 · 할 일 · 질문을 작업 탭에서 떼어 대상별로 모은다. 처음은 메모
  ['records', '#/r/{rid}/records', '기록 화면'],
  ['flow-start', '#/r/{rid}/flow', '흐름 새 점 창', '흐름 점 더하기'],
  // 기록 탭의 질문 (10/15): 답을 대화로, 이어 쓰기, 에이전트가 물은 질문(주황, 사용자 차례). 기록은 fixtures/sandbox-extra/workbench/comments
  ['records-questions', '#/r/{rid}/records', '기록 화면', '[data-ui="기록 거르기"] button:text-matches("^(질문|Question)")'],
  // 프로젝트 정보의 네 쪽 (10/16): 개요 · 현황 · 규칙 · 저장소
  ['info', '#/r/{rid}/info', '노트 정보'],
  ['info-status', '#/r/{rid}/status', '최근 기록'],
  // 규칙 쪽 (옛 AGENTS.md 쪽): 저장소의 AGENTS.md, STATUS.md의 규칙 절, workbench/decisions/
  ['info-agents', '#/r/{rid}/agents', '결정'],
  ['info-repo', '#/r/{rid}/repo', '저장소 정보'],
  ['map', '#/r/{rid}/map', '지도'],
  ['log', '#/r/{rid}/log', '기록'],
  // 맡기기 창, 날짜를 누른 달력, 맡긴 일 목록(필터는 기억되므로 마지막에 판단으로 되돌린다), 보고서
  ['task-dialog', '#/r/{rid}/todo', '맡기기 창', '맡기기'],
  ['task-list', '#/r/{rid}/todo', '맡긴 일 목록', '[data-ui="작업 거르기"] button:text-matches("^(맡긴 일|Delegated)")'],
  ['task-day', '#/r/{rid}/todo', '하루 자세히', ['[data-ui="작업 거르기"] button:text-matches("^(판단|To decide)")', '[data-ui="하루"].is-today']],
  ['task-report', '#/r/{rid}/k/2026-10-05-list-coloring-bound', '다음 지시'],
  ['block', '#/r/{rid}/b/kempe-chains', EDITOR_TEXT],
  ['chapter', '#/r/{rid}/w/docs%2Fnote%2Fchapters%2F02-five-color.tex', EDITOR_TEXT],
  ['chapter-cited', '#/r/{rid}/w/docs%2Fnote%2Fchapters%2F02-five-color.tex', '인용한 논문', '인용한 논문'],
  ['statement', '#/r/{rid}/s/five-color', '진술 머리'],
  // Markdown + KaTeX 연구노트·보조 노트 (10/4 결정): 읽기, 고치기
  ['research-note', '#/r/{rid}/w/workbench%2Fnotes%2Fkempe-recoloring%2Fnote.md', '노트 본문'],
  ['research-note-edit', '#/r/{rid}/w/workbench%2Fnotes%2Fkempe-recoloring%2Fnote.md', '개념노트 편집기', '고치기'],
  // 노트 본문의 그림을 누르면 겹창으로 크게 (10/15 B′): 라이브러리 그림이면 "그림 화면에서 열기"
  ['figure-zoom', '#/r/{rid}/w/workbench%2Fnotes%2Fkempe-recoloring%2Fnote.md', '그림 크게 보기', '[data-ui="노트 본문"] :is(figure.md-fig[data-fig-id] img, img.ob-fig[data-fig-id])'],
  ['aux-note', '#/r/{rid}/b/list-coloring', '노트 본문'],
  // 노트 화면 (10/5 시안): 오른쪽 사이드바 정보를 연 모습
  ['note-info', '#/r/{rid}/b/list-coloring', '노트 정보', '맥락 칸 켜고 끄기'],
  // 오른쪽 사이드바 정보에서 설명을 고치는 모습 (10/5 피드백 "문서 정보 수정의 디자인")
  ['note-info-edit', '#/r/{rid}/b/list-coloring', '노트 정보', '[aria-label="고치기 — 설명"], [aria-label="Edit description"]'],
  // 고치는 중의 노트 머리: 제목이 이름 칸이 된다 (10/5 피드백 "제목 영역 편집")
  ['note-title-edit', '#/r/{rid}/b/list-coloring', '노트 이름', '고치기'],
  // 지식 첫 화면 (라이브러리 L1, 10/6): 최근 노트 · 점검 · 통계 · 라이브러리 정보, "개념노트 만들기" 메뉴. 지도는 지식 안의 페이지(사이드바 "지도" 줄)
  ['knowledge', '#/library', '통계 줄'],
  ['knowledge-list', '#/library/list', '지식 목록 줄'],
  ['knowledge-list-filtered', '#/library/list?subject=Mathematics', '분류 정보'],
  ['knowledge-map', '#/library/map', '지식 지도'],
  ['knowledge-make', '#/library', '개념노트 만들기 메뉴', '개념노트 만들기'],
  ['knowledge-note', '#/library/t/planargraph', '개념노트'],
  ['knowledge-edit', '#/library/t/planargraph', '개념노트 편집기', '고치기'],
  // 에이전트 고침 검토 (10/8): 예제 연구노트에 고침을 넣고 찍은 뒤 되돌린다 (agent-edits.mjs)
  // 마지막 바뀐 곳을 눌러 앞뒤 문단을 펼친 모습 (나머지 줄은 접힌 그대로)
  ['review', '#/r/{rid}/edits', '바뀐 곳', '[data-ui="바뀐 곳"]:last-child'],
  // 바뀐 곳에서 묻기 (10/14): 첫 바뀐 곳에 질문과 답을 넣고(agent-edits.mjs) 대화를 연 모습
  ['review-talk', '#/r/{rid}/edits', '고침 대화', '묻기 버튼'],
  // 확인 필요: 반려한 것을 다시 처리한 항목을 펼쳐 주고받은 기록과 승인·반려를 찍는다 (fixtures/sandbox-feedback)
  ['feedback', '#/feedback', '주고받은 기록', ['[data-ui="거르기"] button:text-matches("^(확인 필요|Needs review)")', '피드백 줄']],
  // 전후 그림 크게 보기 (10/13): 그림이 있는 항목을 펼쳐 전 그림을 누른 모습
  ['feedback-gallery', '#/feedback', '주고받은 기록', ['[data-ui="거르기"] button:text-matches("^(확인 필요|Needs review)")', '[data-ui="피드백 줄"]:has-text("할 일 목록")', '[data-ui="전후 그림"] button']],
  ['about', '#/about', '소개'],
  // 피드백 대화의 태그 표 (10/14): 태그 설명 줄 끝 ?가 여는 절 (10/15부터 기호와 의미 쪽)
  ['about-tags', '#/about/symbols/tags', '대화 태그'],
  // 기호와 의미 쪽 (10/15): 흐름 기호 표, 프로젝트 화면 쪽의 흐름 절 (절 제목 옆 "업데이트 #n")
  ['about-symbols', '#/about/symbols/flow', '흐름'],
  ['about-flow', '#/about/project/flow', '흐름'],
  ['settings', '#/settings', '설정'],
  ['latex', '#/settings/latex', '서식 카드'],
  ['network', '#/network', '사람 카드'],
  ['person', '#/network/ada-e-example', '사람 페이지'],
  // 논문 라이브러리 (10/5; 10/6 L2 첫 화면): 첫 화면(최근 더한 논문 · 점검 · 통계 · 라이브러리 정보), 목록(표), 카드 보기(PDF가 이 맥에 있으면 첫 쪽이 표지), 카드를 고른 모습(오른쪽 칸), PDF 폴더 설정
  ['papers', '#/papers', '통계 줄'],
  ['papers-list', '#/papers/list', '논문 줄'],
  ['papers-cards', '#/papers/list', '논문 카드', '[data-ui="보기 전환"] button:text-matches("^(카드|Cards)")'],
  ['papers-picked', '#/papers/list', '논문 정보', '[data-ui="논문 카드"][data-ui-item="readerGraph2010"]'],
  ['settings-papers', '#/settings/library', 'PDF 폴더 줄'],
  // 논문 하나 열기 (3단계): 하이라이트 두 색, 고른 글에 단 질문, 오른쪽 코멘트 칸. 칠한 곳을 누른 메뉴(색 · 지우기)
  ['paper-open', '#/papers/open/doeStructurePlanar2004', '코멘트'],
  ['paper-open-paint', '#/papers/open/doeStructurePlanar2004', '칠한 곳 메뉴', '![data-ui="PDF"] .pdf-paint'],
  // 그림 라이브러리 (4단계; 10/6 L2 첫 화면): 첫 화면, 목록의 카드(공용 · 프로젝트 전용, tikz 하나), 카드를 고른 모습(오른쪽 칸), 표
  ['figures', '#/figures', '통계 줄'],
  ['figures-cards', '#/figures/list', '그림 카드'],
  // 카드를 누르면 그림 보기 (10/15 B′): 본문에 크게, 아래에 목록 한 줄, 오른쪽에 정보
  ['figures-picked', '#/figures/list', '그림 정보', '[data-ui="그림 카드"][data-ui-item="세 나라 지도"], [data-ui="그림 카드"][data-ui-item="Three-country map"]'],
  ['figures-list', '#/figures/list', '그림 줄', '[data-ui="보기 전환"] button:text-matches("^(표|Table)")'],
  // 프로젝트 사이드바 참고 자료 (5단계): 맨 위 "논문 N편"이 논문 라이브러리로, 라이브러리에 없는 PDF와 파일만 남는다
  ['materials', '#/r/{rid}/notes', '논문 라이브러리로', '재료'],
  // 다크 모드 (10/5 시안 "밝은 다크"): 카드가 모인 주제 화면과 오른쪽 사이드바를 연 노트 화면
  // dark-topic은 배치를 비우고, dark-note-info에서 오른쪽 사이드바를 다시 연다.
  ['dark-topic', '#/r/{rid}/t/coloring', '노트 카드 목록'],
  ['dark-note-info', '#/r/{rid}/b/list-coloring', '노트 정보', '맥락 칸 켜고 끄기'],
  // 프로젝트 안의 개념노트 탭 (10/10 노트 화면 틀 하나): 지식 화면(knowledge-note)과 같은 노트를 탭으로 연 모습. 탭 주소는 별칭을 풀지 않아 파일 id(planar-graph)를 쓴다.
  // 앞 화면의 기억(탭 · 오른쪽 사이드바)을 바꾸지 않게 맨 끝에 둔다
  ['concept-tab', '#/r/{rid}/c/planar-graph', '개념노트'],
  // 개념노트의 오른쪽 사이드바 "기록" = 메모 · 할 일 (말풍선이 기록으로 바꾼다. 갈래가 기억되므로 맨 끝)
  ['knowledge-records', '#/library/t/planargraph', '메모', '코멘트 버튼'],
  // 프로젝트의 오른쪽 사이드바 기록 (10/14 "모두 보기" → 작업 탭). 앞 화면이 기록 갈래를 켜 두었다
  ['project-records', '#/r/{rid}', '모두 보기'],
]

// --sample subjects: a separate .sandbox-shots/subjects-library fixture, preserving the default L2b shots.
export const SUBJECT_SCREENS = [
  ['subjects-knowledge-list', '#/library/list', '지식 목록 줄'],
  ['subjects-knowledge-filtered', '#/library/list?subject=math', '분류의 논문과 그림'],
  ['subjects-knowledge-unclassified', '#/library/list?subject=', '지식 목록 줄'],
  ['subjects-note', '#/library/t/subject-example', '분류 고르기'],
  ['subjects-picker', '#/library/t/subject-example', '분류 고르기 메뉴', '분류 더하기'],
  ['subjects-figures', '#/figures', '통계 줄'],
  ['subjects-figures-filtered', '#/figures/subject%3Amath', '그림 카드'],
  ['subjects-figure-picker', '#/figures/list', '분류 고르기 메뉴', ['[data-ui="그림 카드"][data-ui-item="세 나라 지도"], [data-ui="그림 카드"][data-ui-item="Three-country map"]', '분류 더하기']],
  ['subjects-papers-filtered', '#/papers/subject%3Amath', '논문 줄'],
  ['subjects-paper-picker', '#/papers/list', '분류 고르기 메뉴', ['[data-ui="논문 줄"][data-ui-item="readerGraph2010"]', '분류 더하기']],
]
export const selectScreens = (sample) => sample === 'subjects' ? SUBJECT_SCREENS : DEFAULT_SCREENS

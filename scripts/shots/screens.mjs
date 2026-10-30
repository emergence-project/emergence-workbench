// 편집기에 글이 들어올 때까지 기다린다 (편집기 틀만 먼저 그려진다)
const EDITOR_TEXT = '[data-ui="LaTeX 편집기"] .cm-line:not(:has(br:only-child))'

/** 찍을 화면: [파일 이름, 주소(#뒤), 그려졌다고 볼 부위(data-ui, '['로 시작하면 선택자), 찍기 전에 누를 부위(data-ui 또는 그 목록, 없어도 됨)] — {rid}는 예제 연구 id.
 *  이름이 `dark-`로 시작하면 다크 모드(시스템 설정 흉내)로 찍는다. --theme dark면 모든 화면을 다크로 찍는다(다크 값을 고칠 때 확인용).
 *  @typedef {[name: string, hash: string, ui?: string, click?: string | string[]]} Screen
 *  @type {Screen[]} */
export const DEFAULT_SCREENS = [
  ['home', '#/', '홈'],
  // 홈 카드 보기 (10/5 시안 5단계). 보기는 기억되므로 목록 보기(home)보다 뒤에 둔다
  // 한 일 달력 (10/27): 홈 아래의 달력까지 내려 찍는다. 구글 예제 일정에 여러 날 일정이 있다
  ['home-calendar', '#/', '한 일 달력'],
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
  // 기록 › 내 차례 (10/21 작업 탭을 기록 안으로, 옛 주소 todo): 브리핑 · 한 주 달력 · 판단 · 물은 기록 · 할 일 한 줄씩. 맡긴 일은 fixtures/sandbox-extra/workbench/tasks
  ['todo', '#/r/{rid}/todo', '내 차례 목록'],
  ['flow-pick', '#/r/{rid}/flow', '흐름 앞선 점 고르기', ['[data-ui="흐름 차트"] .fl-node[data-id="kempe-swap"]', '흐름 다음 점 메뉴', '[role="menuitem"]:text-matches("^(앞선 점|Choose several)")', '[data-ui="흐름 차트"] .fl-node[data-id="five-color-theorem"]']],
  // 기록 › 모두 (10/21): 종류 고르기(처음은 메모) · 대상별 목록 · 입력란 · 접힌 작업 일지
  ['records', '#/r/{rid}/records', '작업 기록 목록', '[data-ui="기록 차례"] button:text-matches("^(모두|All)")'],
  ['records-agent', '#/r/{rid}/records', '에이전트 차례 목록', '[data-ui="기록 차례"] button:text-matches("^(에이전트 차례|Agents)")'],
  ['flow-start', '#/r/{rid}/flow', '흐름 새 점 창', '흐름 점 더하기'],
  // 기록 › 모두 › 질문 (10/15): 답을 대화로, 이어 쓰기, 에이전트가 물은 질문(주황, 사용자 차례). 기록은 fixtures/sandbox-extra/workbench/comments
  ['records-questions', '#/r/{rid}/records', '기록 화면', ['[data-ui="기록 차례"] button:text-matches("^(모두|All)")', '[data-ui="기록 거르기"] button:text-matches("^(질문|Question)")']],
  // 점 고치기 안 A (10/20): 계획 · 실행 · 끝맺음 묶음, 채운 수, 빈 칸의 회색 안내
  ['flow-edit-calc', '#/r/{rid}/flow', '흐름 실행 고치기', ['[data-ui="흐름 차트"] .fl-node[data-id="greedy-check"]', '흐름 점 고치기']],
  // 점 고치기 › 카드 (10/23 "판단 설계" 2절): 용어 · 사전 연구 · 완료 조건 · 범위 · 산출과 검사 줄
  ['flow-edit-card', '#/r/{rid}/flow', '흐름 카드 고치기', ['[data-ui="흐름 차트"] .fl-node[data-id="four-colors"]', '흐름 점 고치기']],
  // 프로젝트 정보의 네 쪽 (10/16): 개요 · 현황 · 규칙 · 저장소
  ['info', '#/r/{rid}/info', '노트 정보'],
  // 증명 단계와 빈틈 (10/20): 단계마다 쓰는 것과 확인, 확인 안 된 단계는 점선 번호. 새 점 칸이 남지 않게 다른 화면 뒤에
  ['flow-steps', '#/r/{rid}/flow', '흐름 단계', '[data-ui="흐름 차트"] .fl-node[data-id="degree-bound"]'],
  // 접은 흐름 (10/23 "판단 설계"): 묶음 하나가 점 하나, 누르면 그 묶음의 창. 접기는 기억되므로 흐름 화면 맨 뒤에 둔다
  ['flow-bundles', '#/r/{rid}/flow', '흐름 묶음', '[data-ui="흐름 접기"] button:text-matches("^(접기|Fold)")'],
  ['flow-bundle', '#/r/{rid}/flow', '흐름 묶음 창', '[data-ui="흐름 묶음"] .fl-node[data-id="five-colors"]'],
  ['info-status', '#/r/{rid}/status', '최근 기록'],
  // 규칙 쪽 (옛 AGENTS.md 쪽): 저장소의 AGENTS.md, STATUS.md의 규칙 절, workbench/decisions/
  ['info-agents', '#/r/{rid}/agents', '결정'],
  // 저장소 쪽 (10/28: 저장소와 파일을 합침, 나무는 왼쪽 사이드바 목차 탭). info-repo는 「자세히」를 펼친 모습
  ['info-repo', '#/r/{rid}/repo', '저장소 정보', '[data-ui="저장소 상태 줄"] > .btn'],
  ['info-files', '#/r/{rid}/files', '파일 나무'],
  ['map', '#/r/{rid}/map', '지도'],
  ['log', '#/r/{rid}/log', '기록'],
  // 맡기기 창, 맡긴 일 목록, 날짜를 누른 달력(내 차례), 보고서
  ['task-dialog', '#/r/{rid}/todo', '맡기기 창', '맡기기'],
  ['task-list', '#/r/{rid}/records', '맡긴 일 목록', ['[data-ui="기록 차례"] button:text-matches("^(모두|All)")', '[data-ui="기록 거르기"] button:text-matches("^(맡긴 일|Delegated)")']],
  ['task-day', '#/r/{rid}/records', '하루 자세히', ['[data-ui="기록 차례"] button:text-matches("^(내 차례|Your turn)")', '[data-ui="하루"].is-today']],
  ['task-report', '#/r/{rid}/k/2026-10-05-list-coloring-bound', '다음 지시'],
  ['judge-queue', '#/r/{rid}/records', '판단 대기열', '[data-ui="기록 차례"] button:text-matches("^(내 차례|Your turn)")'],
  // 맡긴 일 ↔ 흐름 점 짝 제안 (10/27): 내 차례 맨 위 띠를 펼친 것
  ['flow-pairs', '#/r/{rid}/records', '흐름 짝 제안', ['[data-ui="기록 차례"] button:text-matches("^(내 차례|Your turn)")', '[data-ui="흐름 짝 제안"] button:text-matches("^(하나씩 보기|Review one by one)")']],
  ['judge', '#/r/{rid}/j/five-color-theorem', '판단 화면 판단'],
  ['judge-card', '#/r/{rid}/j/four-colors', '판단 화면 사전 연구'],
  ['judge-ask', '#/r/{rid}/j/five-color-theorem', '판단 화면 질문', '[data-ui="판단 화면 묻기"]'],
  ['tex-note', '#/r/{rid}/w/workbench%2Fnotes%2Fkempe-chains%2Fmain.tex', EDITOR_TEXT],
  ['chapter', '#/r/{rid}/w/docs%2Fnote%2Fchapters%2F02-five-color.tex', EDITOR_TEXT],
  ['chapter-cited', '#/r/{rid}/w/docs%2Fnote%2Fchapters%2F02-five-color.tex', '인용한 논문', '인용한 논문'],
  ['statement', '#/r/{rid}/s/five-color', '진술 머리'],
  // Markdown + KaTeX 노트 (10/4 결정): 읽기, 고치기
  ['research-note', '#/r/{rid}/w/workbench%2Fnotes%2Fkempe-recoloring%2Fnote.md', '노트 본문'],
  ['research-note-edit', '#/r/{rid}/w/workbench%2Fnotes%2Fkempe-recoloring%2Fnote.md', '개념노트 편집기', '고치기'],
  // 노트 본문의 그림을 누르면 겹창으로 크게 (10/15 B′): 라이브러리 그림이면 "그림 화면에서 열기"
  ['figure-zoom', '#/r/{rid}/w/workbench%2Fnotes%2Fkempe-recoloring%2Fnote.md', '그림 크게 보기', '[data-ui="노트 본문"] :is(figure.md-fig[data-fig-id] img, img.ob-fig[data-fig-id])'],
  ['aux-note', '#/r/{rid}/w/workbench%2Ftopics%2Fkempe%2Flist-coloring%2Fnote.md', '노트 본문'],
  // 노트 화면 (10/5 시안): 오른쪽 사이드바 정보를 연 모습
  ['note-info', '#/r/{rid}/w/workbench%2Ftopics%2Fkempe%2Flist-coloring%2Fnote.md', '노트 정보', '맥락 칸 켜고 끄기'],
  // 오른쪽 사이드바 정보에서 설명을 고치는 모습 (10/5 피드백 "문서 정보 수정의 디자인")
  ['note-info-edit', '#/r/{rid}/w/workbench%2Ftopics%2Fkempe%2Flist-coloring%2Fnote.md', '노트 정보', '[aria-label="수정 — 설명"], [aria-label="Edit description"]'],
  // 고치는 중의 노트 머리: 제목이 이름 칸이 된다 (10/5 피드백 "제목 영역 편집")
  ['note-title-edit', '#/r/{rid}/w/workbench%2Ftopics%2Fkempe%2Flist-coloring%2Fnote.md', '노트 이름', '고치기'],
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
  ['feedback', '#/feedback', '주고받은 기록', ['피드백 줄']],
  // 전후 그림 크게 보기 (10/13): 그림이 있는 항목을 펼쳐 전 그림을 누른 모습
  ['feedback-gallery', '#/feedback', '주고받은 기록', ['[data-ui="피드백 줄"][data-ui-item^="2026-10-04 09:30"]', '[data-ui="전후 그림"] button']],
  // 에이전트 대화 (10/21): 예제 실행기(agentSample.ts)가 계획 승인을 묻는 대화(계획 먼저)를 찍기 전에 만든다 (shots.mjs, {chat}). 오른쪽 사이드바 자리의 패널은 상단바 반짝이
  ['agent', '#/agent/{chat}', '계획 카드'],
  // 노트를 고치고 끝난 대화와 바뀐 곳 패널 (#232)
  ['agent-changes', '#/agent/{done}', '바뀐 곳'],
  // 앱 고치기 대화 (2단계 10/21): 작업 폴더에서 파일 하나를 고치고 PR을 연 대화 (shots.mjs, {appchat})
  ['agent-app', '#/agent/{appchat}', '대화 PR'],
  ['agent-panel', '#/r/{rid}', '에이전트 패널', '[data-ui="오른쪽 사이드바 갈래"] button:nth-of-type(3)'],
  // 패널 자리 (#233): 작업 화면 아래, 노트 옆 칸에 나란히(끝난 대화를 연 패널에서 자리 › 나란히)
  ['agent-dock', '#/r/{rid}/w/workbench%2Fnotes%2Fkempe-recoloring%2Fnote.md', '에이전트 아래 자리', ['맥락 칸 켜고 끄기', '[data-ui="오른쪽 사이드바 갈래"] button:nth-of-type(3)']],
  ['agent-beside', '#/r/{rid}/w/workbench%2Fnotes%2Fkempe-recoloring%2Fnote.md', '[data-ui="에이전트 대화"]', ['맥락 칸 켜고 끄기', '[data-ui="오른쪽 사이드바 갈래"] button:nth-of-type(3)', '대화 자리', '[data-ui="대화 자리 항목"] button:nth-of-type(3)']],
  // 피드백 맡기기 (2단계 나): 수정 요청이 온 항목을 앱 고치기 대화에 맡겨 처리한 뒤, 그 항목의 진행 줄 (shots.mjs가 맡기고 처리 기록을 적는다)
  ['feedback-agent', '#/feedback', '에이전트 진행', ['[data-ui="피드백 줄"][data-ui-item^="2026-10-04 10:15"]']],
  ['about', '#/about', '소개'],
  // 피드백 대화의 태그 표 (10/14): 태그 설명 줄 끝 ?가 여는 절 (10/15부터 기호와 의미 쪽)
  ['about-tags', '#/about/symbols/tags', '대화 태그'],
  // 기호와 의미 쪽 (10/15): 흐름 기호 표, 프로젝트 화면 쪽의 흐름 절 (절 제목 옆 "업데이트 #n")
  ['about-symbols', '#/about/symbols/flow', '흐름'],
  ['about-flow', '#/about/project/flow', '흐름'],
  // 피드백 유형과 답 (10/21): 답의 첫 줄에 쓰는 말 표
  ['about-answers', '#/about/feedback/answers', '유형과 답'],
  ['settings', '#/settings', '설정'],
  // 설정 › 계정 (10/21): 시작 준비 (꼭 할 것 · 선택)
  ['settings-accounts', '#/settings/google', '시작 준비 요약'],
  ['latex', '#/settings/latex', '서식 카드'],
  // 설정 › 에이전트 (10/16): 지시를 맥의 Claude가 언제 하는지
  ['settings-agents', '#/settings/agents', '지시 처리'],
  // 폰에서 보기 (10/30): 예제 모드의 가짜 Tailscale을 켜 둔 화면(주소 · QR)
  ['settings-phone', '#/settings/phone', '폰 주소'],
  // 설정 › 공통 규칙 (10/18): 절마다 읽기, 연필로 연 원문 입력란
  ['settings-rules', '#/settings/rules', '공통 규칙 묶음'],
  ['settings-rules-edit', '#/settings/rules', '공통 규칙 원문', '[data-ui="공통 규칙 고치기"]'],
  ['network', '#/network', '사람 카드'],
  ['person', '#/network/ada-e-example', '사람 페이지'],
  // 사람 고치기 창 (10/18 시안 5절): 주제 · 프로젝트 고치기와 같은 창, 소속은 줄마다 한 칸
  ['person-edit', '#/network/ada-e-example', '사람 고치기 창', '저자 정보 고치기'],
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
  ['dark-note-info', '#/r/{rid}/w/workbench%2Ftopics%2Fkempe%2Flist-coloring%2Fnote.md', '노트 정보', '맥락 칸 켜고 끄기'],
  // 프로젝트 안의 개념노트 탭 (10/10 노트 화면 틀 하나): 지식 화면(knowledge-note)과 같은 노트를 탭으로 연 모습. 탭 주소는 별칭을 풀지 않아 파일 id(planar-graph)를 쓴다.
  // 앞 화면의 기억(탭 · 오른쪽 사이드바)을 바꾸지 않게 맨 끝에 둔다
  ['concept-tab', '#/r/{rid}/c/planar-graph', '개념노트'],
  // 개념노트의 오른쪽 사이드바 "기록" = 프로젝트 기록과 같은 패널 (10/18, 라이브러리 workbench/comments/concept-<id>.md). 말풍선이 기록으로 바꾼다. 갈래가 기억되므로 맨 끝
  ['knowledge-records', '#/library/t/planargraph', '적기', '코멘트 버튼'],
  // 프로젝트의 오른쪽 사이드바 기록 (10/14 "모두 보기" → 작업 탭). 앞 화면이 기록 갈래를 켜 두었다
  ['project-records', '#/r/{rid}', '모두 보기'],
  // 프로젝트 정보 › 변경사항 (10/27): 예제를 이때 git 저장소로 만들고 커밋 · 커밋 안 된 고침 · 에이전트가 받은 때를 넣는다(changes.mjs). 다른 화면이 git 없이 찍히게 맨 끝
  // 홈 카드의 "변경사항 N"(내가 변경사항 쪽을 열기 전)과 그 쪽. 카드 보기는 home-cards가 기억해 두었다
  ['home-changes', '#/', '변경사항 수'],
  ['info-changes', '#/r/{rid}/changes', '변경사항 표'],
]

// --sample subjects: a separate .sandbox-shots/subjects-library fixture, preserving the default L2b shots.
/** @type {Screen[]} */
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

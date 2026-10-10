# 이 저장소에서 일하는 에이전트에게

## 반영 흐름

`claude/...`·`codex/...` 브랜치 → PR → CI 초록 → 합치기. 작업 중 확인은 개발용 예제 모드(`pnpm dev`, :5173)에서 한다. 실사용 앱이 이 폴더에서 돌면 합친 뒤 `main`으로 돌아와 `pnpm service:restart`.

PR마다 GitHub Actions CI(`.github/workflows/ci.yml`: type-check·test·build)가 돈다. CI가 마지막 커밋에서 끝나 초록이면 에이전트가 합친다(도는 중에 합치지 않는다). main 푸시와 문서·계획·피드백 원문만 바뀐 PR에서는 돌지 않는다(Actions 분량을 아끼려고). Actions 분량이 바닥나 CI가 돌지 못하면, 클라우드 세션에서 `pnpm test`와 `pnpm type-check`가 통과하면 합친다. 화면을 바꾼 PR은 `pnpm shots`도 돌리고, TeX 검사가 걸리는 PR은 맥에서 확인한다 (2026-10-04 사용자 결정). 컴파일이 걸린 테스트는 TeX가 있어야 돌아서 `ci.yml`에서는 건너뛰고, 컴파일·원고·서식 파일이 바뀐 PR에서만 `.github/workflows/tex.yml`이 TeX를 깔아 돌린다(리눅스에는 맥 글꼴 이름을 나눔 글꼴로 흉내 낸다: `scripts/ci/mac-fonts.py`). zsh가 없는 클라우드 환경에서는 `scripts/remote` 테스트가 건너뛰어지고, CI는 zsh를 깔아 돌린다.

화면 확인: `pnpm shots`는 예제 모드로 주요 화면 55개(기본 샘플)를 `shots/`에 찍고, 화면 오류(콘솔 오류, 빈 화면)가 있으면 실패한다. CI도 PR마다 돌려 그림을 산출물 `shots`로 남긴다. L5 분류 화면은 `SHOTS_SUBJECTS=1 pnpm shots`로 별도 샘플(`.sandbox/subjects-library`, 별도 설정)의 10화면을 찍는다. 기본 샘플의 L2b 그림은 전후 바이트 비교한다. 사용자에게 화면을 보여 줄 때 이 그림을 쓴다. 클라우드에서는 `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm shots`.

열린 PR은 한 번에 하나다. 시작 전에 열린 PR을 확인하고, 다른 PR이 열려 있으면 먼저 알린다. 같은 화면·기능을 고친 것과 그에 딸린 문서 수정은 한 PR로 묶고, 파일 안전 수정(내용 유실·덮어쓰기)과 서로 관계없는 수정은 따로 올린다.

`AGENTS.md`는 Codex 등 다른 에이전트가 먼저 읽는 파일로, 이 파일을 가리킨다.

**관리자 개인 규칙:** 앱 피드백 처리, 실험 기간, 누가 구현하나, 지금 이어서 할 일은 관리자의 비공개 개인 저장소 `CLAUDE.md`에 있다. 맥에서는 `~/.config/research-workspace/personal/CLAUDE.md`(`apps/server/src/personalRepo.ts`가 받아 두는 사본)가 있으면 이 파일 다음에 읽고 따른다. 둘이 다르면 개인 규칙이 앞선다.

## 용어: 주제와 노트 (2026-10-05 결정)

- **프로젝트**(연구 하나) › **주제**(Topic: 소주제, 노트를 묶기만 함, 한 단계) › **노트**(Note: 그 안에서 완결된 최소 단위 문서). 원고·개념노트·문헌노트는 그대로다. 상세: 관리자 개인 저장소 `planning/requirements.md` 결정 표 "주제와 노트", "원고와 출판", "연구 개요와 진행 현황".
- 연구노트·계산 노트·보조 노트는 정의상 모두 **노트**다. 화면은 10/5 사용자 결정으로 지금 구현한다(시안 README 확정 절). 파일 위치(`workbench/notes/`, `calc/`, `blocks/`)는 그대로 둔다.
- 노트의 주제 소속은 폴더가 아니라 노트 정보에 적는다(연구노트·계산 노트는 `note.yaml`, 블록 노트는 파일 머리). 파일을 옮겨 분류하지 않는다(코멘트·`grounds:`·링크가 경로로 이어져 있다).

## 화면 기준

기준 문서는 **`docs/design-system.md`**(원칙·토큰 값·부품·배치와 쓰는 법·쓰지 말 것·점검 체크리스트)이고, 화면의 정본은 main에서 찍은 `pnpm shots` 그림이다 (2026-10-03 결정). 화면을 바꾸기 전에 그 문서를 읽고, 바꾸는 PR은 전후 그림을 직접 보고 사용자에게도 그 그림으로 보여 준다. 핵심만 줄이면:

- 색: 무채색이 기본이고, 색은 상태에만 쓴다. 상태는 글자 기호가 아니라 색 점(`StatusDot`)과 이름: 파랑 진행, 주황 멈춤, 회색 고리 폐기, 청록 해결 (진술은 옅은 점 증명 작업 없음, — 공리·정의). 강조 색은 주 버튼과 선택 표시에만. 사용자가 볼 것(사용자 차례)은 주황 하나, 빨강은 오류·지우기에만. 텍스트 버튼·링크도 무채색.
- 값: 색·글자 크기·굵기·모서리는 `tokens.css`의 변수만 쓴다. 새 값은 거기에(색은 라이트·다크 둘 다) 더하고 문서 표도 고친다. `pnpm test`의 `scripts/ci/check-design.mjs`가 어긴 줄을 잡는다.
- 부품: 있는 부품(`.btn`, `.btn.primary`, `.a`, `.segmented`, `.on` 선택, 카드, 태그)을 쓴다. 맞는 것이 없으면 부품을 더하고 문서에 적는다.
- 기호와 행동: 한 행동에 이름 하나·기호 하나(더하기 ＋, 고치기 연필, 지우기 휴지통, 빼기·닫기 ×, 컴파일 ▶, 코멘트 말풍선). 항목의 고치기·지우기는 항목 오른쪽 위 아이콘(좁은 패널·사이드바에서는 늘 보이게). 확인은 되돌릴 수 없는 지우기만, 무엇이 남는지 적어서. 표는 문서 4절, 버튼 말·기호도 `check-design.mjs`가 잡는다.
- 글과 용어: 짧고 분명한 말. 디자인 요소 이름은 문서 5절 용어표의 이름 하나만(레일 · 상단바 · 패널 · 탭 바 · 툴바 · 필터 · 태그 · 배지 · 툴팁 · 입력란 · 기록 · 하이라이트, "보조 노트"는 "노트"). 고유어로 새 이름을 짓지 않고 짧은 한자어나 널리 쓰는 외래어를 쓴다(10/7). 예전 이름은 `check-design.mjs`가 잡는다. 버튼은 하는 일을 동사로. 같은 이름을 한 화면에서 두 번 크게 쓰지 않는다.
- 배치(문서 6절, 10/6 피드백에서 뽑음): 고정 영역은 내용 길이와 상관없이 같은 자리, 툴바는 세 구역(왼쪽 무엇 · 가운데 보기 · 오른쪽 행동), 메뉴는 잘리지 않게, 입력란은 연필로만 열고 여러 칸은 고치기 창, 좁은 폭에서 한 글자씩 세로로 끊기지 않게, 1200×735 · 1440×900 · 다크로 본다. 화면 PR은 문서 8절 체크리스트로 점검한다.

## 코드 지도 (여러 스레드가 동시에 고쳐도 덜 부딪히게)

- `apps/server/src/app.ts`: 서버 뼈대(파일 감시, 실시간 알림, 오류 처리)만 둔다. API는 화면 갈래마다 `routes/<갈래>.ts`의 `register…(app, ctx)`에 있고, 함께 쓰는 것은 `routes/context.ts`의 `RouteContext`다. 새 갈래는 파일을 만들고 `app.ts`에 등록 한 줄을 더한다.
- 연구 저장소의 지금 상태(할 일·맡긴 일·질문·검토 대기·최근 기록)는 `pnpm agent:status <연구 저장소 폴더>`로 본다. 맥의 앱이 쓰는 `workbench/STATUS.md`와 같은 내용을 파일에서 바로 뽑으므로 앱·서버가 없는 클라우드에서도 된다(STATUS.md는 git에 없다).
- 에이전트용 MCP 입구(읽기): `apps/server/src/mcp.ts` · `scripts/mcp.mjs`(`pnpm mcp`). 도구는 앱 서버 API만 부르고 파일을 직접 읽거나 쓰지 않는다. 등록과 도구 표는 `docs/agent-mcp.md`.
- 연구 저장소·라이브러리의 파일 형식(앱이 읽고 쓰는 모양)은 `docs/repo-format.md`. 형식을 읽거나 쓰는 코드를 바꾸면 그 문서도 고친다. 파일을 직접 쓰는 에이전트도 이 문서를 따른다.
- 에이전트는 화면 대신 서버 API를 써도 된다: `GET /api`가 모든 경로와 대표 경로(연구 목록, 연구 요약, 코멘트, 일지, 개념노트)를 돌려준다(`routes/apiIndex.ts`). 고칠 때는 읽을 때 받은 hash를 `baseHash`로 보낸다.
- `apps/server/src/*.ts`(routes 밖): 저장소 파일을 읽고 쓰는 실제 일(workbench, manuscript, comments …). 맡긴 일(`workbench/tasks/*.md`)은 `tasks.ts`. 읽은 뒤 바뀌어 쓰지 않는 경우는 `throw new ConflictError(문장, 지금 hash)`(workbench.ts)로 던지면 오류 처리기가 409와 `currentHash`를 보낸다(라우트에서 감싸지 않는다). research.yaml은 `researchYaml.ts`의 `editResearchYaml`로만 고치고, 저장소 밖 경로 판정은 `fsutil.ts`의 `isOutside`·`isInside`를 쓴다(`startsWith('..')`는 `..notes` 같은 이름도 거절한다). 테스트는 `*.test.ts`이고 갈래마다 파일을 나눈다(app·project·feedbackRoutes·appupdate …). 예제 연구와 임시 폴더는 `testkit.ts`의 `useSampleApp()`으로 준비한다.
- `apps/web/src/App.tsx`: 상단바, 레일, 작업 화면 패널. 프로젝트 사이드바(목차)는 `Sidebar.tsx`, 사이드바·탭이 함께 읽는 프로젝트 자료(라이브러리·원고·카드·할 일 수)는 `projectData.ts`의 `useProjectData`. 프로젝트에 속하지 않는 화면(지식·피드백·소개·설정)은 `globalPages.tsx` 목록에 한 항목으로 더한다. 레일 버튼, 위치 표시, 본문이 그 목록에서 나온다.
- `apps/web/src/router.ts`: 주소(#) ↔ 화면. 프로젝트 안의 탭 화면은 `Workspace.tsx`의 `Tab`과 `App.tsx`의 `renderTab`에 더한다.
- `apps/web/src/api/<갈래>.ts`: 서버 호출과 그 타입. 공통 도우미(`req`·`json`·`send`)는 `api/http.ts`. `api.ts`는 다시 내보내기와 `api` 묶음만 두고, 화면 파일은 계속 `./api`에서 가져온다. 새 갈래는 `api/`에 파일을 만들고 `api.ts`에 `export *` 한 줄을 더한다. web 순수 함수 테스트는 `src/*.test.ts`(vitest).
- 스타일: `tokens.css`(색·간격·글자 크기)와 `styles/<화면>.css`. `main.tsx`의 import 순서가 우선순위다. 새 화면은 자기 파일을 만들어 맨 아래에 import 한 줄을 더하고, 남의 화면 파일은 고치지 않는다.
- 화면 글은 `t('한국어', 'English')`로 쓴다(`apps/web/src/i18n.ts`, 서버는 `apps/server/src/i18n.ts`). 저장 값은 한국어 그대로, 보여 줄 때만 `shown()`. 영어 예제는 `pnpm dev:en`·`pnpm shots --lang en`(`fixtures/en/`가 같은 경로의 한국어 예제를 덮는다). 연구 파일에 쓰는 글(일지 머리, STATUS.md, 코멘트 파일)은 읽는 코드가 한국어로 찾으므로 아직 한국어다.
- `data-ui` 값은 피드백 모드의 부위 이름이다. 바꾸면 이전 피드백 기록과 어긋나니 그대로 둔다. 영어 화면에서는 `apps/web/src/uiNames.en.json`의 이름으로 보여 준다(`uiShown()`). 새 `data-ui`를 더하면 그 표에도 영어 이름을 더한다(`uiNames.test.ts`가 빠진 것을 잡는다).
- 구조를 옮기는 변경(화면이 바뀌면 안 되는 것)은 바꾸기 전후 `pnpm shots` 그림이 바이트 단위로 같은지 `cmp`로 확인한다.

## 공개 이슈와 바깥 기여 (2026-10-08 결정)

다른 사람의 피드백은 공개 저장소 Issues·Discussions로, 코드는 fork PR로 받는다. 처리 규칙은 `docs/maintaining.md`. 이슈 댓글·바깥 PR 의견은 관리자 승인 전에 게시하지 않는다.

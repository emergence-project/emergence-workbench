# AGENTS.md

이 저장소(emergence-workbench)에서 일하는 모든 에이전트(Codex, Claude 등)가 먼저 읽는 파일이다.
규칙의 정본은 **`CLAUDE.md`**다. 이 파일은 그것을 가리키는 요약이고, 둘이 다르면 `CLAUDE.md`를 따른다. 관리자의 개인 규칙과 지금 이어서 할 일은 비공개 개인 저장소에 있고(맥에서는 `~/.config/research-workspace/personal/CLAUDE.md`, 있으면 읽는다), 그것이 둘 다보다 앞선다.

## 시작할 때

1. `CLAUDE.md`를 끝까지 읽는다 (반영 흐름, 용어, 화면 기준, 코드 지도). 관리자 맥이면 개인 규칙도 읽는다.
2. `git fetch origin && git log --oneline -15 origin/main`과 열린 PR을 본다. 열린 PR이 있으면 새 작업을 시작하지 않고 사용자에게 알린다 (열린 PR은 한 번에 하나).
3. 화면을 바꾸면 `docs/design-system.md`를 먼저 읽는다.
4. 연구 저장소의 상태가 필요하면 `pnpm agent:status <연구 저장소 폴더>`를 먼저 돌린다(맥의 `workbench/STATUS.md`와 같은 요약, 클라우드에서도 됨). 직접 고친 뒤에는 `pnpm agent:check <연구 저장소 폴더>`로 형식을 검사한다(읽기 전용). 피드백을 처리할 때는 `pnpm agent:feedback <피드백 폴더>`로 에이전트 차례인 항목과 이유를 먼저 본다.

## 꼭 지킬 것 (요약, 상세는 CLAUDE.md)

- 대화는 한국어, 코드·커밋 메시지는 영어, 문서·계획은 한국어.
- 원고 무손실과 에이전트 공존이 먼저다. 블록·원고 본문 바이트를 바꾸지 않고, 바깥에서 고친 내용을 덮어쓰지 않는다 (고칠 때는 읽을 때 받은 hash를 `baseHash`로).
- 사용자의 실제 연구 저장소와 공유 라이브러리 서식, `~/.config/research-workspace`는 사용자 확인 없이 고치지 않는다. 시험은 `pnpm dev`(예제 모드, `.sandbox/`)에서 한다.
- 색·크기는 `tokens.css` 변수만, `data-ui` 값은 바꾸지 않는다, 한 행동에 이름 하나·기호 하나.
- 대소문자만 다른 파일 이름을 만들지 않는다 (맥 파일 시스템).

## PR 하나를 올리는 순서

`CLAUDE.md` "반영 흐름"을 따른다: `origin/main`에서 새 브랜치(`codex/…` 또는 `claude/…`) → `pnpm type-check`·`pnpm test`(화면을 바꿨으면 `pnpm shots`와 전후 그림) → PR → CI 초록 → 합치기.

## 알려진 환경 문제

- `pnpm test`는 앞 검사가 실패해도 뒤 검사를 모두 돌리고 끝에 실패한 것을 모아 알린다(`scripts/ci/test-all.mjs`).
- 서버 테스트 시간 한도는 20초다(`apps/server/vitest.config.ts`). 메모리가 작은 맥에서 그래도 시간 초과가 나면 그 파일만 `--maxWorkers=1`로 다시 돌린다.
- 파일 감시 테스트(`app.test.ts` "파일 감시")는 감시 이벤트가 오면 바로 끝나고, 오지 않으면 15초까지 기다린다. Codex 샌드박스처럼 파일 감시 이벤트가 오지 않는 곳에서는 `CHOKIDAR_USEPOLLING=1 pnpm test`로 돌린다.

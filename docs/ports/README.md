# 이식 안내서

이 앱의 기능을 다른 앱에도 만들 때 쓰는 안내서다. 다른 앱의 에이전트에게 이렇게 맡긴다:

> emergence-workbench의 `docs/ports/<이름>.md`와 거기 적힌 코드를 읽고, 이 앱에도 같은 기능을 만들어 줘.

| 기능 | 안내서 | 핵심 코드 | 소개 절 (사용자가 보는 동작) |
| --- | --- | --- | --- |
| 피드백 | [feedback.md](feedback.md) | `packages/core/src/feedback-buckets.ts`, `apps/server/src/feedback.ts`, `apps/web/src/FeedbackMode.tsx` | 소개 › 피드백 › 남기기 · 모아 보기 · 유형과 답 · 처리와 반영 |
| 에이전트 대화 | [agent-chat.md](agent-chat.md) | `apps/server/src/agentChats.ts`, `agentRunner.ts`, `agentPolicy.ts` | 소개 › 에이전트와 안전 › 앱에서 맡기는 대화 |
| PDF 읽기와 코멘트 | [pdf-comments.md](pdf-comments.md) | `apps/server/src/comments.ts`, `apps/web/src/PdfView.tsx`, `apps/web/src/Comments.tsx` | 소개 › 읽기 › 읽으며 묻기 |

앱의 소개 › 단축키와 파일 위치 › 「다른 앱에 옮기기」가 같은 목록이다.

## 안내서의 모양

맨 위 머리(`---` 사이)에 두 목록을 둔다. CI가 읽는다.

```
---
about:            # 이 기능을 사용자에게 설명하는 소개 절 파일
  - apps/web/src/about/agents/agent-conversations.tsx
code:             # 이 기능의 핵심 구현 파일 (옮길 때 읽을 것)
  - apps/server/src/agentChats.ts
---
```

본문은 [../feedback/new-app.md](../feedback/new-app.md)의 짜임을 따른다:

1. **무엇** — 사용자가 보는 동작 한 단락. 자세한 동작은 소개 절이 정본이라 링크만 한다.
2. **파일 지도** — 층(core · server · web)마다 파일과 맡은 일 한 줄.
3. **저장 모양** — 파일 · 칸 이름과 뜻. 다른 앱이 같은 모양을 쓰면 서로 읽을 수 있다.
4. **옮기는 순서** — 앞 단계만 있으면 쓸 수 있게 나눈 단계.
5. **이 앱에만 있는 것** — 옮기지 않아도 되는 것.
6. **점검** — 다 옮겼는지 확인하는 체크 목록.

## 소개와 맞추기 (CI: `scripts/ci/check-ports.mjs`)

소개는 사용자가 보는 동작을, 안내서는 그것을 만드는 법을 맡는다. 둘이 어긋나지 않게 CI가 본다.

- **짝:** 안내서 머리 `about:`의 절 파일은 ko와 en에 `port: '<이름>'`을 갖는다. 소개는 그 절 맨 아래에 안내서로 가는 줄을 그린다. 거꾸로 `port`를 가진 절은 그 안내서 `about:`에 있어야 한다.
- **경로:** `about:` · `code:`의 경로가 모두 있어야 한다. 파일을 옮기거나 이름을 바꾸면 안내서도 고친다. 이 표와 소개의 「다른 앱에 옮기기」 절(`apps/web/src/about/reference/porting-guides.tsx`)이 모든 안내서를 적는다.
- **코드 변경:** `code:`의 파일을 바꾼 PR은 그 안내서와 `about:`의 소개 절도 고친다. 동작이 그대로라 고칠 것이 없으면 커밋 메시지에 한 줄을 쓴다: 안내서는 `이식 안내서: 그대로 — 이유`, 소개는 `소개: 그대로 — 이유`.

새 안내서를 더할 때: 이 폴더에 `<이름>.md`(머리 포함) → 이 표에 한 줄 → `porting-guides.tsx`의 `GUIDES`에 한 줄 → 소개 절에 `port: '<이름>'`.

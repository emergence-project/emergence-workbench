---
about:
  - apps/web/src/about/reading/asking-while-reading.tsx
code:
  - packages/core/src/contract/comments.ts
  - packages/core/src/comment-target.ts
  - apps/server/src/comments.ts
  - apps/server/src/commentsRead.ts
  - apps/server/src/commentFormat.ts
  - apps/server/src/routes/comments.ts
  - apps/web/src/api/comments.ts
  - apps/web/src/PdfView.tsx
  - apps/web/src/pdfNav.ts
  - apps/web/src/Comments.tsx
---

# PDF 읽기와 코멘트 옮기기

## 무엇

PDF(와 노트)에서 글을 끌어 고르면 메뉴가 뜨고, 그 자리에 하이라이트(네 색) · 메모 · 질문을 남긴다. 기록은 대상마다 Markdown 파일 하나에 쌓이고, 다시 열면 같은 자리에 그려진다. 질문은 에이전트가 같은 파일에 답을 덧붙인다. 자세한 동작은 소개 › 읽기 › 읽으며 묻기(위 `about:`)가 정본이다.

## 파일 지도

| 층 | 파일 | 맡은 일 |
| --- | --- | --- |
| core | `packages/core/src/contract/comments.ts` | 기록 · API 몸통의 모양 (zod) |
| core | `packages/core/src/comment-target.ts` | 대상 이름 규칙(`note-<slug>`, `paper-<이름>` 등) |
| server | `apps/server/src/commentsRead.ts` | 기록 파일 읽기(`parseComments`), 고른 글 다시 찾기(`reanchor`), 목록 |
| server | `apps/server/src/comments.ts` | 기록 쓰기 · 고치기 · 지우기 (읽기 함수도 다시 내보냄) |
| server | `apps/server/src/commentFormat.ts` | 상태 · 답 머리줄의 공통 모양 |
| server | `apps/server/src/routes/comments.ts` | HTTP 경로 `/api/researches/:rid/comments/*` |
| web | `apps/web/src/api/comments.ts` | 위 경로의 클라이언트 |
| web | `apps/web/src/PdfView.tsx` | PDF 그리기(pdf.js), 글 층, 고르기 → 자리(쪽 · 사각형 · 인용), 하이라이트 그리기 |
| web | `apps/web/src/pdfNav.ts` | 쪽의 글 조각과 좌표, 목차 · 링크, 쪽 안 찾기 |
| web | `apps/web/src/Comments.tsx` | 기록 카드: 메모 · 질문 · 답 · 상태 |

## 저장 모양

대상마다 `workbench/comments/<대상>.md` 하나. 형식의 정본은 [../repo-format.md](../repo-format.md) 6절이다.

```
## c-20261001-1612 · 질문 · p.4
<!-- rw: {"page":4,"rects":[[72,120,310,14]],"quote":"고른 글","prefix":"앞 32자","suffix":"뒤 32자"} -->
- 상태: 대기
> "고른 글"

질문 글

### 답 · claude · 2026-10-01 16:20
답 글
- 상태: 답함
```

- 머리: `c-YYYYMMDD-HHMM[-N]` · 종류(메모 · 할 일 · 질문 · 지시 · 하이라이트) · 자리(`p.N` 쪽, `L<n>` 줄, 전체)
- `rw:` 한 줄 JSON: `page`, `rects`(PDF 포인트, 왼쪽 위 원점 `[x, y, w, h]`), `quote` · `prefix` · `suffix`(다시 찾기), `color`(하이라이트), `by`(쓴 에이전트)
- 상태 줄은 질문 · 지시(대기 · 답함 · 끝냄)와 할 일(대기 · 끝냄)에만
- 답은 `### 답 · <이름> · <시각>` 아래에 덧붙인다

## 옮기는 순서

1. **기록 파일.** 위 모양을 읽고 쓰는 함수(`commentsRead.ts` · `comments.ts`)와 대상 이름 규칙. 사람이 읽을 수 있는 Markdown이라 에이전트도 그대로 읽는다.
2. **PDF 고르기 → 자리.** `PdfView.tsx`처럼 pdf.js 글 층에서 고른 범위를 쪽 번호 · 사각형(PDF 포인트) · 인용 글로 바꾼다. 화면 배율과 상관없게 PDF 좌표로 둔다.
3. **다시 그리기.** 다시 열 때 `rects`를 그 쪽의 배율로 그린다. 노트(글 파일)는 `prefix + quote + suffix`로 먼저, 안 되면 `quote`만으로 저장한 줄에 가까운 곳을 찾는다(`reanchor`). 못 찾으면 지우지 않고 잃음 표시만.
4. **카드와 경로.** 더하기 · 고치기(상태 · 글 · 색) · 지우기, 충돌을 막는 파일 hash.
5. **질문에 답하기.** 질문을 에이전트에게 보내고, 답을 같은 파일에 `### 답`으로 덧붙인다(이 앱은 [agent-chat.md](agent-chat.md)의 대화로).

## 이 앱에만 있는 것

- 공용 논문 라이브러리의 기록(`paperComments.ts`, Zotero 좌표: 왼쪽 아래 원점)
- 기록을 LaTeX 주석으로 내보내기(`pdfRecords.ts`)와 GitHub로 올리기
- 끝낸 할 일을 일지에 적기(`commentJournal.ts`)

## 점검

- [ ] 배율을 바꿔도 하이라이트가 같은 글 위에 있다
- [ ] 앱을 다시 열면 같은 자리에 같은 기록이 보인다
- [ ] 노트 글을 고쳐도 인용 글이 남아 있으면 기록이 그 자리를 다시 찾는다
- [ ] 기록 파일을 손으로 열어 읽을 수 있다

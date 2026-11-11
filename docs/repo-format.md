# 연구 저장소 파일 형식

이 문서는 앱이 디스크에서 **지금 실제로** 읽고 쓰는 파일 형식을 적는다. 사람·에이전트·앱이 같은 파일을 고치므로, 이 형식이 앱의 진짜 계약이다. 파일을 직접 쓰는 에이전트는 이 문서를 따른다.

- 2026-10-10 main 코드에서 옮겨 적었다. 형식은 바꾸지 않았다. 코드와 이 문서가 다르면 지금은 코드가 맞고, 이 문서를 고친다.
- 같은 파일을 코드의 여러 곳이 다르게 읽던 곳("어긋남")은 10/10에 모두 하나로 맞췄다(#19, #24). 새로 찾으면 여기에 "어긋남"으로 적고 맞춘다. 파일을 쓰는 쪽은 각 절의 "쓸 때" 모양을 따른다.
- 파일을 직접 쓴 뒤 `pnpm agent:check <저장소>`로 형식과 바뀐 것(§15)을 검사한다(읽기 전용).
- 근거 위치는 `apps/server/src/` 기준 파일 이름이다(`packages/core/src/`는 `core/`).

## 0. 모든 파일에 공통

| 항목 | 규칙 |
|---|---|
| 글자 | UTF-8. **BOM을 넣지 않는다**: 머리말 읽기가 모두 BOM 뒤의 `---`를 알아보지 못한다. |
| 줄 끝 | 읽기는 LF와 CRLF를 모두 받는다. 앱이 고칠 때는 대체로 파일의 줄 끝을 따르지만, 코멘트 덧붙이기·답 넣기는 LF만 쓴다(§6). 새 파일은 LF로 쓴다. |
| hash | `sha256(파일 글자를 UTF-8로).hex` 앞 16자 (`fsutil.ts` `hashOf`). 고치기 API의 `baseHash`가 이 값이다. 파일이 없으면 `''`. |
| 쓰기 | 같은 폴더에 `.<이름>.<8 hex>.tmp`로 쓴 뒤 이름을 바꾼다(`writeAtomic`). 심볼릭 링크는 따라가지 않고 링크 자리를 바꾼다(예외: `references.bib`가 `.bib`를 가리킬 때). |
| 날짜·시각 | 로컬 시각. 날짜 `YYYY-MM-DD`, 시각 `HH:MM`, 함께 쓸 때 `YYYY-MM-DD HH:MM`. YAML의 기본 스키마가 이것을 글자로 둔다. |
| 감시 | 이름이 `.`으로 시작하는 경로는 감시하지 않는다(`watcher.ts`). |
| 백업 사본 | 백업 동기화가 `<이름>.github-YYYYMMDD<확장자>`를 원본 옆에 둘 수 있다(`backup.ts`). 일지와 코멘트는 읽지 않고, 맡긴 일은 "백업 사본"이라는 진단으로 보인다(`fsutil.ts` `isBackupCopy`). 원본과 합친 뒤 지운다. |

### 0.1 머리말 (`---`)

Markdown 파일 첫 줄의 `---`부터 다음 `---`까지를 YAML 머리말로 읽는다. 읽는 코드는 하나다: `packages/core/src/front-matter.ts`의 `frontMatter`(와 `stripFrontMatter` · `frontMatterEnd` · `frontMatterLines`). 서버·화면·`agent:status`가 모두 이것을 쓴다.

- 여는 줄과 닫는 줄은 `---`이고 뒤 공백·탭은 괜찮다. `----`, `---x`는 닫는 줄이 아니다.
- 닫는 줄 뒤는 줄바꿈(`\n`·`\r\n`)이나 파일 끝이다.
- 닫히지 않으면 머리말이 없는 것으로 본다(파일 전체가 본문).
- 파일 앞의 BOM은 받지 않는다.
- 빈 머리말(`---` 바로 다음 줄이 `---`)은 머리말로 보지 않는다.

진술의 머리(`core/block-header.ts`, §3.1)는 80줄 제한과 tex의 `% ---`가 있는 다른 형식이라 따로 읽는다.

**쓸 때:** 첫 줄은 정확히 `---`, 닫는 줄도 정확히 `---`(앞뒤 공백 없음), 닫는 줄 뒤에 줄바꿈, 80줄 이내, BOM 없음.

## 1. 연구 저장소의 배치

연구 저장소 하나 = 프로젝트 하나. 앱은 `<저장소>/workbench/`만 자기 폴더로 쓴다.

```
<저장소>/
  workbench/
    research.yaml        프로젝트 정보 (§2)            사람·에이전트·앱
    preamble.tex         예전 블록 컴파일 머리 (지금은 읽지 않음)  사람 (처음 한 번 만들어 줌)
    macros.tex           프로젝트 매크로               사람·앱(노트 복사 때 덧붙임)
    topics/<주제>/       주제 폴더 (§2.2, 쓰는 프로젝트만)  사람·에이전트·앱
      topic.yaml         주제 정보
      <폴더>/            이 주제가 주인인 연구노트 (§4.4)
    notes/<폴더>/        연구노트 (§4). 주제 폴더를 쓰면 주제 없는 노트만  사람·에이전트·앱
    calc/<폴더>/         계산 노트 (§4)                같음
    figures/             프로젝트 그림 (§8)            사람·앱
    log/YYYY-MM-DD.md    일지 (§5)                     앱·사람·에이전트
    tasks/<id>.md        맡긴 일 (§7)                  앱·에이전트
    decisions/<날짜-이름>.md  결정 (§13)               사람·에이전트
    rules/<이름>.md      프로젝트 규칙 (§13)           사람·에이전트
    comments/<대상>.md   코멘트·기록 (§6)              앱
    materials/           내려받은 PDF (안에 .gitignore `*`)  앱·사람
    STATUS.md            자동 요약 (§9)                앱만. 고치지 않는다
    .build/              컴파일 산출물 (.gitignore)     앱만
    .trash/              지운 노트 (15일 뒤 비움)       앱만
  statements/            진술 (블록 머리 형식)
```

- **주제 폴더 배치 (2026-10-13 결정 "연구 저장소 폴더").** `workbench/topics/`가 있는 프로젝트는 주제 폴더를 쓴다: 주제 정보는 `topics/<주제>/topic.yaml`(§2.2), 연구노트는 주인 주제의 폴더 안(§4.4). 없으면 예전 배치(주제는 `research.yaml`, 노트는 `notes/`)로 읽는다. 한 프로젝트 안에서 두 모양이 섞여 있어도 읽는다(옮기는 중인 저장소).
- 처음 만들 때(`Workbench.scaffold`) 없는 것만 쓴다: `research.yaml`(`title`·`question`·`started`), `preamble.tex`, `.gitignore`(`.build/`, `STATUS.md`), `figures/.gitkeep`, `log/.gitkeep`.
- `STATUS.md`는 새로 만든 `workbench/.gitignore`가 git에서 뺀다. 그 전에 만든 저장소는 각 연구 저장소의 `.gitignore`가 뺀다.
- `workbench/`가 git에 한 번도 들어가지 않았으면(`research.yaml`이 추적되지 않음) 앱이 첫 화면과 현황에 알리고, 「커밋하고 올리기」(`POST /api/researches/:rid/repo/workbench`)가 `.gitignore`에 `.build/` · `STATUS.md`를 채운 뒤 `workbench/` 안만 커밋해 올린다(10/30).
- 저장소 밖에 두는 것: 에이전트 고침 기록, 개념 색인, 그림 캐시, 앱 설정(§11).

### 1.1 저장소 맨 위 폴더 (2026-10-13~)

사람이 폴더를 열어 일할 때도 같은 자리에 같은 것이 있도록 맨 위 폴더를 여섯으로 맞춘다(2026-10-13 결정 "연구 저장소 폴더"). 앱은 맨 위 폴더를 만들거나 옮기지 않고 읽기만 한다(`apps/server/src/projectFolders.ts`). 에이전트가 폴더마다 어떻게 고치는지는 `STATUS.md` "폴더와 편집 규칙" 절에 보인다(§9). 저장소의 `AGENTS.md`가 더 엄하면 그것을 따른다.

| 폴더 | 무엇 | 에이전트가 고칠 때 |
|---|---|---|
| `workbench/` | 앱: 주제·노트·작업·결정·규칙·일지 | 이 문서대로. 해결 노트·확인한 개념노트·`accepted` 규칙과 결정은 허락받은 뒤 |
| `docs/` | 우리가 쓴 글: 설계·안내·원고·검토 보고(`reviews/`) | 저장소 규칙대로. 원고는 사용자가 요청할 때만 |
| `sources/` | 원자료와 받은 원본 | 고치지 않는다. 근거로만 쓴다 |
| `code-space/` | 패키지·스크립트·예제·테스트·모형 정의 | 저장소 규칙대로 |
| `data-space/` | 계산이 만든 그림과 데이터 | 손으로 고치지 않고 스크립트로만 다시 만든다 |
| `archive/` | 더 고치지 않는 보존본 (`날짜-이름/`) | 고치지 않는다 |

- 여섯 밖의 폴더(그 연구에만 있는 것, 예: `biz-space/`)는 고유 폴더로 `research.yaml` `folders:`에 `"폴더 — 설명"` 한 줄씩 적는다(§2). 앱이 맨 위에서 읽는 진술 폴더 `statements/`는 적지 않아도 고유 폴더로 세고, 옮기면 앱이 못 찾으니 옮기지 않는다. 점으로 시작하는 폴더, `node_modules`, `__pycache__`는 세지 않는다.
- **표준 배치를 쓰기 시작한 저장소**(주제 폴더 `workbench/topics/`나 `folders:`가 있는 것)에서만 `agent:check`가 표준도 `folders:`도 아닌 맨 위 폴더를 경고한다. 예전 배치의 저장소는 경고하지 않고 `STATUS.md`에 "표준 밖"으로만 보인다.

## 2. `research.yaml`

YAML 지도 하나. 깨진 YAML이면 프로젝트가 "열 수 없음"으로 보이고(주제 목록만 `[]`로 넘어감), 앱은 이 파일을 고치지 않는다(409).

| 키 | 모양 | 없을 때 |
|---|---|---|
| `title` | 글자 | 저장소 폴더 이름 |
| `question` | 글자 (연구의 질문) | `''` |
| `started` | `YYYY-MM-DD` | `''` |
| `agent-status` | `true`일 때만 `STATUS.md`를 쓴다 | 쓰지 않음 |
| `latex-macros` | 저장소 기준 경로 (있어야 함) | `workbench/macros.tex` |
| `latex-template` | 서식 id | 앱 기본 |
| `image` | `figure:<범위>/<파일>` 또는 저장소 안 그림 경로 | 없음 |
| `concepts` | 개념노트 id 목록 | `[]` |
| `topics` | 주제 목록 (§2.2). 주제 폴더면 id 한 줄씩 (순서) | `[]` |
| `folders` | 표준 밖 맨 위 폴더 `"폴더 — 설명"` 목록 (§1.1). 표준 폴더·하위 경로는 적지 않는다 | `[]` |
| `sources` | 자료 지도 (§2.1) | |

### 2.1 `sources`

| 키 | 모양 |
|---|---|
| `canon` | `"경로 — 설명"` 목록. 없는 경로·저장소 밖 경로는 버린다. |
| `manuscript` | `"경로.tex — 이름"` 하나 또는 목록. **`.tex`만** 받는다. 첫째가 메인 원고. 이름이 없으면 부모 폴더 이름. |
| `tasks` | 경로 하나. 그 파일에서 `상태`(`Status`) 열과 `내용`(`작업`·`항목`·`Task`) 열이 함께 있는 첫 Markdown 표를 읽는다. 없으면 `상태` 열이 있는 첫 표, 그것도 없으면 첫 표. 작업 표 위에 일정표 같은 다른 표가 있어도 된다. |
| `bib` | 경로 하나 또는 목록. 없으면 저장소 맨 위의 `*.bib`. 노트가 인용한 키가 여기 없으면 공유 라이브러리 `references.bib`에서 찾는다(화면의 인용 정보, Markdown 노트 PDF의 참고문헌은 그 항목만 뽑은 `library-refs.bib`). 저장소 밖 경로는 받지 않는다. |
| `materials` | 경로 하나 또는 목록. 그 폴더 바로 아래의 PDF · 발표 · 그림과 글 문서(`.md` · `.txt` · `.docx` · `.html` 등)만 참고 자료에 보인다. 코드(`.py` · `.jl` · `.ipynb` …)와 데이터는 빼고, 저장소 쪽 파일 나무에서 본다. |
| `reviews` | 폴더 목록. 안의 `.md` 중 머리말에 `status:`가 있는 것을 읽고(`sources/`·`archive/` 폴더는 건너뜀), `in-review`(옛 이름 `proposed`·`needs-review`·`needs-revision` 포함)만 "검토 대기"(사용자 차례)로 센다. `draft`·`in-progress`는 쓰는 중, `accepted`·`closed`·`superseded`는 끝난 것이다(`core/review-status.ts`). |

- 경로와 설명은 `—` 또는 `-` 앞뒤 공백으로 나눈다. 그래서 **경로에 ` - `나 ` — `가 있으면 거기서 잘린다.** 이름에도 `—`·` - `를 쓰지 않는다.
- Markdown 노트는 `manuscript`로 적지 않는다. `notes/`·`calc/`의 노트는 앱이 저절로 원고 후보에 넣는다.

### 2.2 `topics`

두 모양이 있고 한 목록에 섞여도 된다.

**주제 폴더 (2026-10-13~).** `research.yaml`에는 주제의 순서만 id 한 줄씩 적고, 주제 정보는 `workbench/topics/<id>/topic.yaml`에 둔다(`topics.ts`).

```yaml
# research.yaml
topics:
  - kempe
  - discharging

# workbench/topics/kempe/topic.yaml
title: Kempe 사슬
description: …
star: true
```

- `topic.yaml`의 칸은 아래 예전 모양과 같다. id는 폴더 이름이고 `id:`는 읽지 않는다. `title`이 없으면 id가 이름이다.
- 목록에 없는 주제 폴더도 `topic.yaml`이 있으면 뒤에 붙여 읽고, 앱이 주제를 고칠 때 목록 끝에 id를 적는다. `topic.yaml`이 없는 폴더는 목록에 적었을 때만 주제다(이름은 id, 앱이 빈 `topic.yaml`을 만들지 않는다).
- 같은 id가 예전 모양(`- id: …` 지도)으로도 적혀 있으면 `research.yaml` 것을 읽는다.
- 앱이 고칠 때: 주제 폴더의 주제는 `topic.yaml`을, 예전 모양은 `research.yaml`을 고친다(목록 순서는 늘 `research.yaml`). 주제 폴더를 쓰는 프로젝트에서 새 주제는 주제 폴더로 만든다. 주제를 지우면 `topic.yaml`을 지우고, 그 주제가 주인인 노트를 다음 주제의 폴더나 `notes/`로 옮긴 뒤 빈 폴더를 지운다.
- 주제를 고칠 때 보내는 `baseHash`는 주제 폴더가 있으면 `research.yaml`과 모든 `topic.yaml`을 함께 본 값이다(없으면 `research.yaml`의 hash 그대로).

**예전 모양.** `research.yaml` 안에 주제마다 지도로 적는다.

```yaml
topics:
  - id: kempe            # [a-z0-9][a-z0-9-]*, 없으면 제목에서 만든다
    title: Kempe 사슬     # 필수, 80자
    description: …       # 300자, 20줄
    parts: [docs/note/a.tex]
    blocks: [kempe-chains]   # 예전 블록 노트 소속 (읽지 않고 둔다, §3)
    manuscript: …
    done: true
    star: true
    preview: { text: …, image: figure:…, color: violet|blue|teal|orange|gray }
```

- 100개까지. 읽지 못하는 항목은 건너뛰고, 앱이 고칠 때도 그 자리에 둔다.
- 노트가 어느 주제에 속하는지는 **노트 쪽**에 적는다(§3 `topics:`, §4 `note.yaml` `topics:`). 앞의 것이 대표 주제다. 주제 폴더 안 노트는 그 폴더의 주제가 대표(주인) 주제다(§4.4).

### 2.3 쓸 때

- 앱은 YAML 문서로 읽어 해당 키만 고친다(`researchYaml.ts` `editResearchYaml`). 주석과 다른 키는 남는다.
- 예외: 메인 원고 지정(`mainNote.ts`)은 글자를 직접 넣는다. `sources.manuscript`를 흐름 목록(`[…]`)이나 `|`·`>`로 쓰면 앱이 고치지 못한다(409). 블록 목록으로 쓴다.

## 3. 블록 노트 없앰 (2026-10-27)

- 예전의 블록 노트(`workbench/blocks/<id>.md|.tex`, 파일 머리에 정보를 적은 노트 한 파일)는 2026-10-27에 없앴다. 모든 노트는 §4의 노트 폴더 하나다. 앱은 `blocks/`를 읽지 않고, `pnpm agent:check`가 남은 파일을 오류로 알린다.
- 옮기는 법: `blocks/<id>.md` → `topics/<주제>/<id>/note.md`, `blocks/<id>.tex` → `…/<id>/main.tex`(주제가 없으면 `notes/<id>/`). 머리를 떼어 `note.yaml`에 적는다: `title` → `name`, `status` `blocked` → `state: paused`(`resume-condition` → `resume`), `stopped` → `stopped`, `solved` → `done`, `topics`·`concepts`·`kind`·`description`·`star`는 같은 이름. 머리의 나머지(`created`·`parent`·`blocked-reason`·`grounds:` 등)는 본문 끝에 적어 둔다.
- 기록 `comments/block-<id>.md`는 `comments/note-<id>.md`로 옮긴다(Markdown 노트만 기록이 붙는다, §6). 맡긴 일의 `workbench/blocks/…` 경로는 새 본문 경로로 바꾼다. 진술의 `proofs:`는 노트 폴더 이름을 그대로 쓴다.
- 예전 일지의 블록 id 대상은 같은 이름의 노트로 연다(없으면 프로젝트). `research.yaml` 주제의 `blocks:`(예전 기록)는 읽지 않고 남아 있어도 그대로 둔다.

### 3.1 머리 형식 (진술 · 개념노트가 쓴다)

```
---                                   % ---
id: list-coloring                     % id: five-color
title: 목록 색칠로 넓히기              % title: 5색 정리
status: blocked                       % status: in-progress
parent: kempe-chains                  % created: 2026-09-30
blocked-reason: …                     % topics: [coloring]
resume-condition: …                   % ---
created: 2026-10-04                   \section{5색 정리}
topics: [kempe, coloring]
kind: check
description: |-
  꼭짓점마다 …
---
```

- `.md`는 `---` 사이, `.tex`는 `% ---` 사이(안의 줄은 모두 `%`로 시작). 첫 줄에서 시작하고 **80줄 안에서 닫아야** 한다.
- **YAML이 아니라 줄 단위로 읽는다**(`core/block-header.ts`). 키는 소문자·숫자·`-`만(`_` 안 됨). 값은 그 줄 하나이고, `"…"`로 감싸면 JSON으로 푼다. 목록은 `[a, b]` 또는 `a, b`.
- 여러 줄 값(`|`, `>`, `- ` 목록)은 아래 표에 없는 키에서만 읽는다. **표의 키는 한 줄로 쓴다**(예: `alternatives:`를 `- ` 목록으로 쓰면 `[]`로 읽힌다).

| 키 | 뜻 |
|---|---|
| `id`, `created` | 만든 뒤 바꾸지 않는다 |
| `title` | 제목 |
| `status` | `in-progress` · `blocked` · `stopped` · `solved`. 없거나 틀리면 `in-progress` |
| `blocked-reason`, `resume-condition` | `blocked`일 때 둘 다 필요 |
| `stopped-reason` | `stopped`일 때 필요 |
| `concepts`, `topics` | 개념 id·주제 id 목록 |
| `kind` | `proof calc theory check summary explore design` |
| `description` | 200자, 20줄 |
| `star` | `true` 또는 없음 |

- 그 밖의 키(예: `grounds:`)는 그대로 둔다. 앱이 머리를 고칠 때 바이트를 지킨다.
- 앱은 머리만 고치고 본문 바이트는 그대로 둔다. 상태를 바꾸면 그날 일지에 `상태` 기록을 남긴다.

## 4. 연구노트·계산 노트 (`notes/`, `calc/`, `topics/<주제>/`)

```
workbench/notes/<폴더>/
  note.md 또는 main.tex     본문 (둘 다 있으면 note.md)
  note.yaml                 노트 정보
  note-macros.tex           (복사로 만든 노트) 노트 폴더의 .sty 불러오기
  그 밖의 그림·.bib·\input 파일
```

- id는 폴더 이름이다. 앱이 만들 때는 이름을 ASCII로 줄인 40자(`slugOf`), 겹치면 `-2`, `-3`.
- **노트 정보는 `note.yaml`에만 적는다.** `note.md`의 머리말은 건너뛰고 아무 키도 읽지 않는다. (예전 블록 노트는 반대로 파일 머리에 적었다, §3.)

### 4.1 `note.yaml`

```yaml
name: Kempe 사슬로 다시 칠하기
description: 차수 5인 꼭짓점의 이웃을 …
topics: [kempe]
kind: summary
star: true
```

| 키 | 모양 |
|---|---|
| `name` | 보이는 이름. 없으면 폴더 이름 |
| `from` | 복사해 온 원고 경로 (앱이 씀) |
| `description` | 요약. 옛 키 `summary`도 읽는다(앱이 고치면 `description`으로 바꿈) |
| `state` | `paused` · `stopped` · `done`. 진행 중이면 키를 두지 않는다. 옛 `done: true`도 `done`으로 읽는다 |
| `resume` | `paused`·`stopped`일 때 다시 시작할 조건 (300자) |
| `topics`, `concepts` | id 목록 |
| `kind` | `proof calc theory check summary explore design`. `calc/`는 없으면 `calc`. `none`은 분류 안 함 |
| `star` | `true` 또는 없음 |

- 화면 상태: `paused`→멈춤, `stopped`→폐기, `done`→해결, 그 밖→진행.
- `note.yaml`이 깨지면 이름은 폴더 이름으로 넘어가고, 앱은 고치지 않는다(400).

### 4.2 원고로서의 노트

- 모든 노트가 원고 후보다. `research.yaml`에 적은 `.tex` 원고가 먼저, 그다음 노트들.
- 원고의 부분: `.tex`는 `\begin{document}` 뒤의 `\input{}`·`\include{}`(없으면 `\section{}`마다), `\appendix` 뒤는 부록. `.md`는 코드·`$$` 밖의 `#`·`##` 제목마다, `\appendix` 한 줄 뒤는 부록.
- 처음 500자 안의 `%!TeX program = …`이 컴파일 엔진을 정한다.
- 컴파일은 노트 폴더에 아무것도 쓰지 않는다. 산출물은 `.build/manuscript[-<키>]/`.

### 4.3 휴지통

- 지우면 폴더를 `workbench/.trash/<폴더>-<YYYYMMDDTHHMMSS>/`로 옮기고 `trash.yaml`(`name`, `from`, `at`)을 쓴다. 15일 뒤 목록을 읽을 때 비운다.
- `research.yaml` 글 어딘가에 경로가 나오는 노트는 지우지 않는다.
- 되살리면 원래 자리(`from`)로 간다. 주제 폴더에서 지운 노트는 그 주제 폴더가 없어졌으면 `notes/`로 간다. 이름이 겹치면 `-2`, `-3`.

### 4.4 주제 폴더 안 노트 (2026-10-13~)

주제 폴더를 쓰는 프로젝트(§1)에서는 연구노트를 주인 주제의 폴더에 둔다. 안의 모양은 위 `notes/<폴더>/`와 같다.

```
workbench/topics/kempe/
  topic.yaml
  recolor-five/          주인 주제가 kempe인 노트
    note.md
    note.yaml            topics: [kempe, discharging]
workbench/notes/
  scratch-ideas/         주제 없는 노트
```

- **주인 주제 = 놓인 폴더.** `note.yaml` `topics:`에는 주인 주제를 맨 앞에, 다른 주제를 뒤에 적는다. 주인을 빠뜨리거나 다른 순서로 적어도 폴더가 이긴다(`noteList.ts`).
- **같은 노트.** `topics/<주제>/<폴더>/…`와 `notes/<폴더>/…`는 같은 노트다(`core/comment-target.ts` `canonicalNoteFile`). 코멘트 대상(`note-<폴더>`, §6.1), 컴파일 폴더(`.build/manuscript-<키>`), 에이전트 고침 기록이 이 이름으로 이어지므로 주제를 바꿔 옮겨도 따라간다. 옛 경로로 부르는 API(열어 둔 화면, 일지의 대상)도 지금 자리의 노트를 읽고 쓰고, 화면은 열린 탭과 주소를 지금 경로로 바꾼다. 맡긴 일의 `references:` 같은 글 속 경로는 고치지 않는다.
- 그래서 **노트 폴더 이름은 `notes/`와 모든 주제 폴더를 통틀어 하나다.** 앱은 만들 때 겹치면 `-2`를 붙이고, `agent:check`는 겹친 것을 오류로 잡는다.
- **옮기기.** 앱에서 노트의 첫 주제를 바꾸면 노트 폴더를 그 주제의 폴더로 옮긴다. 첫 주제가 없거나 예전 모양의 주제면 `notes/`로 옮기고, 비게 된 주제 폴더(`topic.yaml`도 없는 것)는 지운다. 옮길 자리에 같은 이름이 있으면 아무것도 고치지 않고 409. 사람·에이전트가 옮길 때도 폴더를 통째로 옮기고(`git mv`) `note.yaml` `topics:` 맨 앞을 새 주인으로 고친다.
- **계산 노트.** 주제 폴더를 쓰는 프로젝트에서 앱이 새로 만드는 계산 노트는 연구노트와 같은 자리에 `note.yaml` `kind: calc`로 만든다. 지금 있는 `calc/` 노트는 그대로 읽고 앱이 옮기지 않는다(코멘트 대상이 `calc-<폴더>`라 옮기면 기록이 끊긴다).

## 5. 일지 (`log/YYYY-MM-DD.md`)

```
# 2026-09-30

## 09:40 · 상태 · discharging
진행 중 → 막힘

## 16:05 · 완료 · kempe-chains
식 (3.5)의 유일성 조건 적기
<!-- rw-todo: block-kempe-chains/c-20260929-1120 -->
```

일지는 **있었던 일**만 적는다(2026-10-16 "할 일 원본 하나"). 할 일의 지금 상태는 기록 파일(§6)이 정본이고, 일지에는 할 일을 끝낸 날 `완료` 한 줄이 남는다.

- 파일 이름이 날짜(`^\d{4}-\d{2}-\d{2}\.md$`)인 것만 읽는다.
- 기록 머리: `## H:MM · <종류> · <대상>`. `·`는 U+00B7. 종류는 `메모` · `할 일` · `상태` · `완료` 넷뿐(**한국어 글자로 찾는다**). 대상은 `연구`, 노트·원고 경로(예전 기록의 블록 id는 같은 이름의 노트, §3). 앱은 `할 일`을 새로 쓰지 않는다(아래 "예전 할 일").
- 다른 `#`·`##` 줄은 기록을 끝내고, 그 뒤 글은 다음 기록 머리까지 버린다. `###`부터는 본문이다.
- `완료`: 끝낸 할 일의 글. 다음 줄의 `<!-- rw-todo: <기록 대상>/<기록 id> -->`가 그 할 일 기록을 가리킨다(§6.5). 주제와 경로를 모르는 노트의 할 일은 대상이 `연구`다.
- **예전 할 일**(10/16 전): 본문 첫 줄이 `- [ ] ` 또는 `- [x] `인 `할 일` 기록. 앱은 프로젝트를 열 때(그리고 받기 뒤) **끝내지 않은 것**을 그 대상의 기록 파일로 옮기고 일지에서 뺀다. 대상은 `연구` → `project`, 노트 경로 → `note-<폴더>`·`calc-<폴더>`, 그 밖(원고·`.tex` 노트)은 `project`이고 글 끝에 ` (<원래 대상>)`을 붙인다. 기록 id는 일지의 날짜·시각(`c-YYYYMMDD-HHMM`)이다. 이미 기록과 이어진 줄(`rw-todo`, 또는 같은 시각·같은 글의 기록)은 빼기만 한다. 끝낸 것(`[x]`)은 있었던 일이라 그대로 두고 읽기만 한다. 사람·에이전트도 일지에 할 일을 쓰지 않는다: 할 일은 기록으로 적는다(MCP `add_record`는 질문·메모용이고, 사용자의 할 일은 사용자가 적는다).
- 할 일 글 앞머리의 `M/D` 또는 `YYYY-M-D`(뒤에 공백·`까지`·끝)를 마감으로 읽는다(기록의 할 일도 같다. 연도가 없으면 적은 날 기준).
- 앱은 기록을 파일 끝에만 덧붙인다. 기록은 파일 안의 차례(0부터)로 가리키고, 고칠 때 그 기록의 지금 글(`was`)이 같은지 본다(hash 대신).
- 에이전트 고침 검토에서 프로젝트 노트의 문단을 되돌리면 `상태` 기록을 덧붙인다: `에이전트 고침 되돌림 · <에이전트들> · "<되돌린 문단의 에이전트 글 앞 60자>…"`. 대상은 저장소 기준 노트 본문 경로다. 발췌의 줄바꿈·공백은 한 칸으로 줄인다. 일지 쓰기가 실패해도 되돌리기는 성공으로 두고 오류만 로그에 남긴다. 개념노트에는 프로젝트 일지가 없어 기록하지 않는다.
- `상태` 기록은 고치거나 지울 수 없다. `완료` 기록은 지우기만 된다.

## 6. 코멘트·기록 (`comments/<대상>.md`)

노트·PDF·원고에 단 메모·할 일·질문·지시·하이라이트. **노트 파일은 고치지 않고** 여기에 위치(인용·앞뒤 글·줄)로 붙인다.

### 6.1 대상 이름

`^[a-z]+(?:-[A-Za-z0-9._-]{1,160})?$`, `..` 없음.

| 대상 | 무엇에 |
|---|---|
| `project` | 프로젝트 전체 |
| `note-<폴더>`, `calc-<폴더>` | 노트 (주제 폴더 안 노트도 `note-<폴더>`, §4.4) |
| `paper-<PDF 이름>` | 자료 PDF |
| `manuscript`, `manuscript-<키>` | 원고 PDF |
| `statement-<id>` | 진술 |
| `topic-<id>` | 주제 (주제 화면에서 적은 것, 10/15) |
| `flow-<id>` | 옛 흐름 점의 기록(10/15~11/11). 점을 없앤 뒤로는 새로 쓰지 않고, 있는 파일은 그대로 읽는다 |

### 6.2 파일

```
# 코멘트 · 논문 sample2007
<!-- rw-source: sample2007.pdf -->

> 연구 작업대 앱의 기록. … (안내문, 읽지 않음)

## c-20261001-1612 · 질문 · p.4
<!-- rw: {"rects":[[72,140.5,300,11]]} -->
> "the Kempe chain length bounds the cost of a swap"
- 상태: 대기

여기서 속도 상한이 격자 상수에 어떻게 의존하는지?

### 답 · claude · 2026-10-01 16:40
…
- 상태: 답함
```

- 기록 머리: `## <id> · <종류> · <위치>`. id는 `c-YYYYMMDD-HHMM`(겹치면 `-2`). `·` 앞뒤는 공백 하나.
- 종류: `메모` · `할 일` · `질문` · `지시` · `하이라이트`. `코멘트`와 모르는 종류는 `메모`로 읽는다. 누가 움직이는지로 가른다: 메모는 아무도, 할 일은 사용자, 질문은 에이전트가 답하고, 지시(10/15)는 에이전트가 하고 답한다(종결 조건·보고서가 필요한 큰 일은 맡긴 일로).
- 위치: `p.N`(PDF 쪽), `L<n>`(줄), `전체`.
- 상태 줄 `- 상태: <대기|답함|끝냄>`: 질문·지시는 셋 다, 할 일은 `대기`·`끝냄`, 다른 종류는 없음. 기록 안 어디에 있어도 되고 마지막 것이 이긴다.
- 정보 줄 `<!-- rw: {JSON} -->`과 인용 `> "…"`은 머리 바로 아래, 본문 글보다 앞에만 둔다.
  - JSON 키: `rects`(PDF 점, 왼쪽 위 기준 `[x,y,w,h]`), `color`(`yellow green blue pink`), `line`, `prefix`·`suffix`(각 32자), `quoteMultiline`, `unsorted`, `split`, `edit`·`editBase`, `part`·`partText`, `by`, `todo`, `field`·`fieldHash`. 예전 할 일의 `journal`·`journalIndex`(10/16 전 일지 연결)는 읽기만 하고 새로 쓰지 않는다.
  - `by`는 그 기록을 쓴 에이전트 이름이다(10/15, 영어 소문자 · 숫자 · `-`, 20자까지, 예: `claude-code`, `codex`). 에이전트가 아니면 앱이 `src`를 적는다(10/21 "기록의 쓴 이"): `user`는 사용자가 앱에서 쓴 것, `app`은 앱이 저절로 남긴 것(개념노트 초안의 할 일 등). `by`도 `src`도 없는 기록은 2026-10-22 전 id(`c-20261021-…`까지)면 사용자가 쓴 것으로 읽고, 그 뒤 id면 앱 · MCP를 거치지 않고 파일에 직접 쓴 것이라 화면이 "작성자 없음"을 오류 색으로 보이고 `pnpm agent:check`가 오류를 낸다. 그래서 에이전트는 기록을 MCP `add_record`로 쓰고, 직접 써야 하면 정보 줄에 `by`를 적는다. 에이전트가 쓴 질문 · 지시가 `대기`면 **사용자 차례**다(앱에서 주황, 홈 "확인 필요"와 왼쪽 띠의 수에 셈). 에이전트 함(답 없는 질문 · 대기 중인 지시)에는 사용자가 쓴 것만 든다.
  - `part`·`partText`는 적기 칸의 가리키기로 고른 화면 부위(피드백 모드와 같은 부위 이름, 바깥부터 ` › `로 잇는다)와 그 부위의 글자(10/15). 노트 본문 앵커가 아니라서 다시 찾지 않는다.
  - `edit`(`질문` · `수정`)은 고침 검토의 바뀐 곳에서 물은 질문이다(10/14). 인용은 물을 때의 지금 문단, `editBase`는 고치기 전 글의 앞 200자. `수정`은 그 문단을 다시 고쳐 달라는 것: 에이전트는 `edit_note`로 다시 고치고(검토 대상으로 남음) 무엇을 바꿨는지 답을 단다(MCP `answer_record`).
  - `todo`는 같은 파일의 할 일 id(`c-…`)다(10/19 결정 "할 일에 에이전트에게"). 그 할 일에 대해 사용자가 물은 질문 · 지시에만 붙고, 화면은 그 기록들을 할 일 아래 대화로 모아 보인다. 에이전트는 MCP `list_records` · `pnpm agent:records`에서 그 할 일의 글을 함께 받는다(`todo: { id, body }`). 답은 다른 질문 · 지시와 같이 그 기록 아래에 단다.
- 답: `### 답 · <누가> · YYYY-MM-DD HH:MM` 아래 본문, 그리고 상태 줄. 답은 여럿 이어질 수 있고 적힌 차례대로 대화로 읽는다. `<누가>`가 `사용자`이면 사용자가 앱에서 이어 쓴 글이다(10/15).
- 본문의 줄이 `#`, 상태 줄, 정보 줄처럼 보이면 앞에 `\`를 붙여 쓴다.
- 종류 바꾸기(10/21): 사용자가 쓰고 답이 없는 메모 · 할 일 · 질문 · 지시는 고칠 때 종류를 바꿀 수 있다(할 일 · 바뀐 곳에 이은 질문은 그대로). 앱은 머리의 종류를 바꾸고, 상태 줄을 지운 뒤 메모가 아니면 `- 상태: 대기`를 정보 줄 · 인용 다음에 두며, `unsorted`를 뗀다.

### 6.3 쓸 때

- 새 기록은 파일 끝에 덧붙인다(hash 없음). 답도 hash 없이 그 기록 끝에 넣는다.
- 고치기·지우기는 파일 전체의 `baseHash`가 필요하다. 바꾸는 기록 밖의 바이트는 그대로 둔다.
- 답이 달린 기록은 지울 수 없다.
- 에이전트가 질문에 답하거나 지시를 마쳤을 때: 그 기록 끝에 `### 답 · <이름> · <시각>`과 본문, `- 상태: 답함`을 덧붙인다. 다른 기록은 고치지 않는다.
- 사용자가 질문 · 지시 아래에 이어 쓸 때(10/15): 그 기록 끝에 `### 답 · 사용자 · <시각>`과 본문, 상태 줄을 덧붙인다. 사용자가 쓴 기록이면 `- 상태: 대기`(다시 에이전트 차례), 에이전트가 쓴 기록(`by`)이면 사용자가 답한 것이라 `- 상태: 답함`.
- 에이전트가 사용자에게 물을 때(10/15): 새 질문 기록을 정보 줄에 `by`를 넣어 덧붙인다(MCP `add_record`). 노트의 한 곳을 물으면 그 글을 인용으로 붙인다.
- **GitHub에 올리기(10/15):** 맥의 앱은 기록을 쓴 뒤(더하기 · 고치기 · 지우기 · 상태 · 답 · 이어 쓰기 · 분류 · 하이라이트, MCP 포함) 30초 조용하면 `workbench/comments/`와 일지 `workbench/log/`만 커밋해 푸시한다(일지 메모와 할 일 옮기기도 `log/`를 고친다, 10/18). 커밋 메시지는 `Add comments from the research workspace app`(GitHub에서도 바뀐 파일을 합친 커밋은 끝에 ` (merged with GitHub)`). 경로 밖 파일은 올리지 않는다. GitHub가 앞서 있으면 그 위에 기록 파일만 얹은 커밋을 올리고, 맥에만 있던 커밋이 모두 `comments/`·`log/` 안이면 맥의 브랜치를 그 커밋으로 옮긴다(`git reset --keep`, 저절로 받기가 막히지 않게). 클라우드 에이전트가 같은 파일에 답을 덧붙였으면 `git merge-file`로 합쳐 보고, 부딪히면 아무것도 바꾸지 않고 오른쪽 사이드바 기록에 실패 한 줄을 띄운다. 그래서 클라우드에서 기록 파일을 고칠 때도 다른 기록의 줄은 건드리지 않고 덧붙이기만 한다. 예제 모드는 올리지 않는다.

### 6.4 위치 다시 찾기

인용이 있고 쪽이 없는 기록은 읽을 때마다 원본에서 `prefix+quote+suffix`, 안 되면 `quote`를 저장된 줄에서 가장 가까운 곳으로 찾는다. 못 찾으면 "잃음"으로 보인다. 파일에 다시 쓰지는 않는다.

### 6.5 할 일 (2026-10-16 "할 일 원본 하나")

- 할 일의 정본은 이 기록 파일이다. 적을 때 일지에는 쓰지 않는다. 할 일은 `project`·노트·주제에 적는다.
- `끝냄`으로 바꾸면 앱이 그날 일지(§5) 끝에 `완료`와 `<!-- rw-todo: <대상>/<id> -->`를 덧붙인다. 기록과 일지를 함께 쓰고, 일지 쓰기가 실패하면 기록도 되돌린다(되돌리기 전에 바깥에서 바뀐 글은 보존하고 부분 저장을 알린다). 다시 `대기`로 바꾸거나 글을 고치거나 지워도 지난 `완료`는 그대로 둔다(있었던 일).
- 끝내지 않은 할 일은 사이드바 기록 옆 수, 첫 화면 할 일, 홈·작업 탭 달력의 마감, STATUS "할 일" 절, 한눈에 표가 모두 이 파일에서 읽는다(서버 `todos.ts openTodos`, 요약 `GET /api/researches/:rid`의 `todos`). 차례는 마감이 이른 것부터, 마감이 없으면 먼저 적은 것부터.

## 7. 맡긴 일 (`tasks/<id>.md`)

규칙 문서는 [agent-delegated-work.md](agent-delegated-work.md). 여기서는 형식만 적는다.

- 파일 이름: `^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$`.
- 머리말: §0.1의 "쓸 때" 모양. 최소 한 줄.
- **머리말에 오류가 하나라도 있으면 그 일은 화면에서 사라지고 오류로만 보인다.**

| 키 | 모양 |
|---|---|
| `title`, `task` | 필수, 비지 않은 글자 |
| `state` | 필수: `working` · `proposed` · `result` · `done` · `paused` · `stopped` |
| `topic`, `agent`, `created`, `end-condition`, `avoid`, `result-at`, `conclusion`, `checkpoint`, `checkpoint-at` | 글자 또는 비움. **숫자는 안 된다**(`topic: 123` 오류, 따옴표로 감쌈) |
| `priority` | `1` 먼저 · `2` 보통 · `3` 나중 (2026-10-13~). 없으면 보통. 그 밖의 값은 오류. `STATUS.md` 맡긴 일 절이 이 순서로 보인다 |
| `end-check` | `pass` · `fail` · `unknown` |
| `references`, `outputs` | 글자 목록 |
| `proposal` | `state: proposed`일 때 필수: `{end-condition: [글자…], reason: 글자}` |
| `flow` | 없앰(2026-11-11). 옛 흐름 점을 가리키던 칸으로, 남아 있어도 읽지 않는다. 질문의 답을 찾는 일은 맡긴 일이 아니라 흐름(§16)의 시도로 한다 |
| `ask` | 3개까지: 글자 또는 `{q, options?: [글자]}` |
| `kind` | (맡기기 요청에만, 파일에는 없다) 만들 작업 점의 종류 `calc` · `analytic` · `proof` · `literature`, 비우면 `calc` (2026-10-30~) |
| `next` | 글자 또는 `{task, end-condition?, started?, dropped?}` |
| `issues` | 글자 또는 `{text, impact?, next?: 양의 정수}` |
| `answers` | `{n, answer, note?, at?}` (앱이 씀) |
| `judged` | `{verdict: approve|send-back|pause|discard, note?, at?, seconds?}` (앱이 씀) |
| `check` | `{machine?, repro?, human?}` |

- 본문의 `## 요약과 결론`, `## 근거`는 관례이고 앱이 읽지 않는다.
- 앱은 머리말만 다시 쓰고(주석은 남음) 본문 바이트는 그대로 둔다. 판단·답·다음 일은 파일 전체의 `baseHash`가 필요하다.

## 8. 그림

- 프로젝트 그림 `workbench/figures/`, 공용 그림 `<라이브러리>/figures/`. 맨 위만 본다(하위 폴더 안 봄).
- 종류: `.tikz`·`.tex`(tikz), `.svg`, `.png`, `.jpg`·`.jpeg`, `.pdf`. 파일 이름 `^(?!\.)[\p{L}\p{N} ._()-]{1,120}$`.
- 같은 폴더의 `figures.yaml`: 파일 이름 → `{name?, description?, subjects?}`. `name`이 파일 이름(확장자 뺀 것)과 같으면 적지 않는다. `name`에 `[ ] | #`를 쓰지 않는다.
- 노트에서 부르기: `![[이름]]`(뒤에 `|폭`). 또는 한 줄짜리 `![설명](파일)`인데 그 파일이 노트 폴더에 없을 때. 프로젝트 그림이 공용 그림보다 앞선다.
- `\documentclass`가 없는 tikz는 앱이 `standalone`으로 감싼다.

## 9. `STATUS.md`

- `research.yaml`에 `agent-status: true`일 때만 앱이 쓴다. **사람·에이전트는 고치지 않는다.** 고칠 것은 원본 파일에서 고친다.
- 둘째 줄 `> 연구 작업대 앱이 자동으로 쓰는 요약이다 …`에 시각이 있고, 이 줄 말고 바뀐 것이 없으면 다시 쓰지 않는다.
- 같은 내용을 `pnpm agent:status <저장소>`로 파일 없이 볼 수 있다. 기본은 짧은 요약(머리 · 목표 · 지금 할 것을 말하는 짧은 절, 다른 절은 이름과 크기만)이고, `--section <절 이름>`은 그 절만, `--full`은 전부다(MCP `project_status`도 같다. 에이전트가 읽는 양을 줄이려고, 10/15). 폴더를 여럿 주거나 연구 저장소들을 담은 폴더를 주거나 `--all`(이 컴퓨터 앱에 등록한 진행 중 프로젝트)이면 프로젝트마다 한 줄인 "한눈에" 표를 보인다(사용자 차례는 홈의 "확인 필요"와 같은 계산, MCP `overview`와 같은 표).
- Git 맨 위 폴더에 추적 브랜치가 있으면 마지막으로 받은 refs 기준 뒤처짐·앞섬을 첫 안내 줄 바로 뒤에 경고한다(뒤처짐은 `FETCH_HEAD` 시각과 겹치는 파일도 표시). 요약은 fetch하지 않으며 하위 폴더 예제는 건너뛴다. 앱에서 원격을 확인하거나 받으면 `agent-status: true`인 요약도 다시 쓴다.
- 앱 홈의 받기는 이 컴퓨터에만 있는 커밋이나 겹치는 파일이 없을 때 빨리 감기만 한다. 겹치지 않는 커밋 안 한 변경은 남겨 두고, 겹치면 파일 이름을 알리고 멈춘다(병합·리베이스·stash·덮어쓰기 없음).
- 절 차례: 정본 위치 → 공통 규칙 → 폴더와 편집 규칙 → 프로젝트 규칙 → 할 일 → 맡긴 일 → 흐름 → 에이전트 수정 검토 대기 → 대기 중인 질문 → 대기 중인 지시 → 사용자 검토 대기 문서 → 원고 → 주제 → 노트 → 진술 → 자료 → 최근 7일 기록. 비어 있는 선택 절은 생략한다.
- 공통 규칙 절은 모든 연구 저장소에 통하는 규칙 파일(설정 폴더의 개인 저장소 사본 `personal/rules/research.md`, 또는 `RW_COMMON_RULES`가 가리키는 파일)이 있을 때만 보인다. 머리말, 맨 위 `# 제목`, 첫 절 앞의 머리 글을 떼고 절 제목을 한 단계 내린 그대로이고, 파일 경로와 머리말의 `status`, 우선순위(저장소 규칙은 더하거나 더 엄하게만, 그 일에 대한 사용자의 직접 지시가 가장 앞섬)를 안내 줄에 적는다. 앱은 설정 › 공통 규칙에서만 이 파일을 쓴다: 사용자가 저장하면 머리말의 다른 칸은 두고 `status: accepted` · `updated` · `reviewed-by: 사용자` · `reviewed-at`을 오늘로 적고(저장이 확인), 개인 저장소 사본이면 먼저 받은 뒤 이 파일만 커밋해 올린다(커밋 `Update common research rules`, §13).
- 폴더와 편집 규칙 절(§1.1)은 지금 있는 표준 폴더와 `folders:`의 고유 폴더, 그 밖의 맨 위 폴더를 보인다. `workbench/` 말고 표준 폴더가 없고 표준 배치도 쓰지 않으면 생략한다. 프로젝트 규칙 절은 `workbench/rules/`의 규칙을 제목·status와 함께 보인다(§13).
- 흐름 절은 흐름(§16)이 있을 때만 보인다. 진행 중인 흐름마다 한 줄(질문 · 시도 수와 한도 · 판정 대기 · 결정 대기)이고, 자세한 것은 이어받기 요약(`problem_brief`, `pnpm agent:problem <폴더> brief <흐름>`)으로 읽는다. 짧은 요약에서는 지금 할 것 절이다. 방향 보고가 사용자의 결정을 기다리는 흐름은 홈 · 레일의 수에 넣는다(11/11).
- 맡긴 일 절은 `priority`가 앞인 것부터(없으면 2), 같으면 최근에 맡긴 것부터 보인다.
- 노트 절은 연구노트·계산 노트를 ● 진행 → ⏸︎ 멈춤 → ✓ 해결(사용자가 확인함, 고치기 전에 허락) → ■ 폐기 순으로 보인다. 같은 상태 안에서는 최근 고친 것부터다. 본문이 `note.md`이면 기록 대상 이름 `note-<폴더 slug>`·`calc-<폴더 slug>`도 보인다(영문·숫자·`.`·`_`·`-` 외 글자와 연속 `..`는 `_`로, 160자까지). `main.tex`에는 기록 칸이 없다.
- 에이전트 수정 검토 대기는 앱 설정의 `agent-edits/edits-*.json`을 읽기만 한다. 바뀐 곳 수·에이전트·첫 고침 시각과 확인된 노트의 허락 대기를 보이고, 쓰기·검토 결정 뒤에 갱신한다. CLI는 `RW_CONFIG_DIR` 또는 기본 설정 폴더가 없으면 이 절을 생략한다.
- 할 일 절의 "앱 할 일"은 기록 파일(§6.5)의 끝내지 않은 할 일을 대상마다 묶어 한 줄씩 보인다: `- [ ] 글 — 마감 YYYY-MM-DD · \`<대상>/<id>\``(본문은 싣지 않는다. 사용자가 할 일이라 에이전트는 대신하지 않고 맥락으로만 읽는다). 앱이 아직 옮기지 않은 예전 일지 할 일(§5)이 있으면 그 수를 한 줄로 알린다.
- 원고 절은 `sources.manuscript`에 명시한 `.tex`만 보인다. 한 파일 원고는 장·부록 수만, 다른 파일을 부르는 원고는 장 목록을 보인다. 노트는 원고 절을 따로 만들지 않고, 마지막 앱 컴파일에 오류가 있으면 노트 줄에 `컴파일 오류 N`과 다음 줄에 오류 3개까지 보인다.

## 10. 공용 라이브러리

앱 설정의 `library:`가 가리키는 폴더. 경로에 공백·`{}%\#~$^&`가 있으면 라이브러리 기능이 꺼진다. 라이브러리 자체의 작성 규칙은 그 저장소의 README가 정본이고, 여기서는 앱이 읽고 쓰는 모양만 적는다.

| 경로 | 무엇 |
|---|---|
| `concepts/<id>.md` | 개념노트 (§10.1) |
| `concepts/<id>.memo.md` | 옛 개념노트 메모(10/18 전, 앱은 더 읽지 않음). 머리말 없는 자유 Markdown. `pnpm library:memos <라이브러리> --apply`가 기록 카드로 옮기고(제목 줄은 굵은 글로, 제목만 있는 절은 버린다) 원래 파일은 `workbench/.trash/concept-memos/`로 보낸다 |
| `workbench/comments/concept-<id>.md` | 개념노트 기록 (§10.5, 10/18~): 연구 저장소 기록(§6)과 같은 형식 · 같은 자리 |
| `concepts/<id>.tex` | 옛 LaTeX 개념노트 (블록 머리 형식). 같은 id의 `.md`가 있으면 숨김 |
| `concepts/macros.tex` | 공용 매크로 |
| `concepts/attachments/` | 개념노트 그림 |
| `papers/<키>.md` | 문헌노트 (11/5~). YAML 머리말 `title` · `status`(draft · reviewed) · `authors` · `year` · `eprint` · `created`, 본문은 `# 제목`과 절 `## 요약` · `## 핵심 주장` · `## 방법` · `## 질문·열린 문제` |
| `papers/<키>.tex` | 옛 LaTeX 문헌노트 (블록 머리 형식). 같은 키의 `.md`가 있으면 `.md`를 쓴다 |
| `references.bib` | 참고문헌. 앱은 끝에 덧붙이고, 사용자가 고른 arXiv 번호만 그 항목에 적는다(10.4) |
| `papers.yaml` | bib 키 → `{projects?, pdf?, subjects?}` |
| `comments/<키>/c-*.md` | 논문 코멘트 (§10.3) |
| `figures/`, `figures/figures.yaml` | 공용 그림 (§8) |
| `subjects.yaml` | 분류 나무 (§10.2) |
| `study/<id>.yaml` | 공부: 책 · 강의 하나 (§10.6, 11/10~) |
| `to-learn.yaml` | 공부할 것 (`items: [{id, term, at, note?, from?, concept?}]`). 앱은 YAML 문서로 읽어 고친 항목만 바꾼다. 주석, 다른 키, 앱이 못 읽는 항목(id 없는 것 등)은 남는다 |
| `preamble/*.tex` | 컴파일 머리. 이름 `^[a-z0-9-]+\.tex$`, 머리 `% place: first|last` |

### 10.1 개념노트 머리말

```
---
title: Subject example
aliases: [Classification example]
subjects: [math/graph/coloring, cs/ml]
sources: [doeStructurePlanar2004]
related: [planar-graph]
checked:
  at: 2026-10-04
  hash: ee242587833dc928
---
# Subject example
```

- id(파일 이름): `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- 키: `title`, `aliases`, `subjects`(분류 나무가 있을 때) 또는 옛 `subject`("A › B"), `sources`(bib 키), `related`, `sources_unsorted`, `study`, `checked: {at, hash}`, `locked: true`, `review: todo`. 앱이 쓰기만 하는 키: `drafted_by`, `drafted`.
- `status` 키는 없다. "확인함"은 `checked.hash`가 지금 본문(CRLF→LF, 앞뒤 공백 제거)의 hash와 같을 때다. 머리말만 바꾸면 확인이 풀리지 않는다.
- `locked: true`인 노트는 앱이 본문을 고치지 않는다(423).
- "틀뿐"(`제목·틀뿐`), "빈 절", "TODO" 같은 미완성 표시는 본문에서 계산하며 저장하지 않는다.
- 인용은 본문에 `[@키]`, `[@키, 위치]`, `[@a; @b, 위치]`. 위치는 **괄호 안 마지막 키에만** 붙는다.
- 다른 노트 잇기: `[[이름]]`(제목·별칭·파일 이름으로 찾음).

### 10.2 분류 (`subjects.yaml`)

- 파일이 있으면 분류를 쓰고, 없으면 옛 `subject:` 글자를 쓴다.
- id → `{name}`. id는 `/`로 이은 3단계까지(`math/graph/coloring`), 부모가 있어야 한다.
- 노트·논문·그림의 `subjects`는 1~3개, 모두 있는 id여야 한다. 하나라도 틀리면 분류 안 됨으로 본다. 첫째가 대표.

### 10.3 논문 코멘트

- 코멘트 하나가 파일 하나: `comments/<bib 키>/c-YYYYMMDD-HHMMSS.md`.
- 머리말 키: `id`, `kind`(`메모`·`코멘트`·`질문`·`하이라이트`), `state`(질문만), `color`, `project`, `page`(**0부터**), `rects`(**왼쪽 아래 기준** `[x1,y1,x2,y2]`, Zotero 방식), `pageHeight`, `quote: {exact}`, `created`(ISO). 답은 본문에 `### 답 · …`.
- 프로젝트 코멘트(§6)와 쪽 번호·좌표 기준이 다르다. 다른 파일이고 Zotero에서 가져온 것과 맞추려고 일부러 다르게 둔다. 쓸 때 섞지 않는다.
- 고치기·지우기의 `baseHash`는 그 키 폴더의 모든 코멘트 파일을 이은 것의 hash다.

### 10.5 개념노트 기록 (2026-10-18 "지식 라이브러리도 같은 장치로")

개념노트의 메모 · 할 일 · 질문 · 지시는 연구 저장소 기록(§6)과 같은 형식으로 `<라이브러리>/workbench/comments/concept-<개념노트 id>.md`에 둔다. 개념노트 하나에 파일 하나이고, 카드는 그 파일 안에 쌓인다. 첫 줄 머리는 `# 코멘트 · 개념노트 <제목>`, 원문은 `<!-- rw-source: concepts/<id>.md -->`이며, 고른 글의 줄 번호는 머리말을 센 파일 줄 번호다.

- 앱 API는 연구 기록과 같은 `/api/researches/:rid/comments…`에 rid 자리로 `_library`(`LIBRARY_RID`)를 넣는다. MCP 기록 도구(`list_records` · `read_records` · `answer_record` · `add_record`)도 `project: _library`로 같고, 앱 서버 없이는 `pnpm agent:records <라이브러리 폴더>` · `pnpm agent:answer <라이브러리 폴더> …`.
- 연구 저장소와 같은 장치가 돈다: 기록을 쓰면 30초 뒤 `workbench/comments`(와 있으면 `workbench/log`)만 올리고, 10분마다 받으며, 설정 › 에이전트의 지시 처리가 라이브러리의 지시도 맥의 Claude에게 넘긴다(작업 폴더는 라이브러리, 규칙은 라이브러리 `AGENTS.md`).
- 화면(10/18 3b): 개념노트 오른쪽 사이드바 "기록"은 프로젝트 기록과 같은 패널이다. 앱은 `concepts/<id>.memo.md`를 더 읽지도 쓰지도 않는다. Study에서 개념노트를 만들면 원문은 이 파일의 할 일 한 장(옮기기)과 메모 한 장(원문)이 된다.
- 라이브러리 기록 모음(`GET …/_library/records`)에는 빈 `project` 묶음이 없다(라이브러리에는 프로젝트가 없다).
- 논문 코멘트(§10.3, 기록 하나가 파일 하나)는 아직 따로다.

### 10.6 공부 (`study/<id>.yaml`, 2026-11-10 "공부는 지식 라이브러리에", 11/11 "회차별 계획")

책 · 강의 하나가 파일 하나다. 정리한 내용은 개념노트(§10.1)에 쌓고, 이 파일은 장(강의는 회차)마다 계획과 진도만 가진다. 지식 화면 왼쪽 사이드바 「공부」에서 보고 고친다.

```yaml
title: Graph Theory
kind: 강의            # 책 · 강의 (없거나 모르면 책)
source: doeStructurePlanar2004   # references.bib 키, 없어도 됨
chapters:
  - title: Kempe chains and the five color theorem
    state: 읽는 중     # 아직(적지 않음) · 읽는 중 · 끝
    goals:            # 학습 목표: 체크하지 않는다
      - Kempe 사슬로 다섯 색 정리를 증명한다
    read:             # 읽을 것: 문헌 키 + 쪽 · 절, 또는 글 + 주소
      - key: doeStructurePlanar2004
        at: §3
        done: true    # 체크한 것만 적는다
      - text: Lecture notes, week 3
        url: https://example.org/week3
    concepts:         # 개념노트 id. 아직 없는 노트도 미리 적는다
      - kempe-chain
      - id: planar-graph
        done: true
    do:               # 할 일
      - 바퀴 그래프 W5에서 Kempe 사슬 바꾸기를 손으로 해 보기
      - text: 다섯 색 정리의 증명을 다시 쓰기
        done: true
  - Euler's formula   # 글자 하나면 제목만 있는 장
```

- id(파일 이름): `^[a-z0-9][a-z0-9-]{0,80}$`. 앱은 제목에서 만들고(영문이 없으면 `book`), 겹치면 `-2` …를 붙인다.
- 체크리스트 셋(`read` · `concepts` · `do`)의 항목은 체크하지 않았으면 글자 하나(`read`는 글자 하나가 bib 키 모양이면 키, 아니면 글), 체크했으면 `done: true`가 붙은 묶음이다. `read`의 `key`는 `references.bib` 키(§10.4 모양)이고, 공부의 교재 · 논문도 bib에 등록한다(11/11).
- 앱이 저장할 때는 파일 전체를 다시 쓴다(주석은 사라진다). 기본값(`state: 아직`, 빈 목록, `done: false`)은 적지 않는다.
- 고치기 창에서 고칠 때는 읽을 때 받은 hash를 `baseHash`로 보낸다. 그새 바뀌었으면 409. 화면의 체크 하나(`POST /api/library/study/<id>/check`)는 파일을 새로 읽어 그 칸만 바꾸고, 그 줄이 그새 바뀌었으면 409.
- 없는 개념노트 id는 지우지 않고 「만들 노트」(점선)로 보인다. 누르면 id의 하이픈을 띄어 쓴 제목으로 만들어 같은 id가 된다.

### 10.4 `references.bib`에 덧붙일 때

- 키: 첫 저자 성(ASCII 소문자) + 제목 첫 낱말(첫 글자 대문자) + 연도, 겹치면 `a`~`z`. `^[A-Za-z0-9][A-Za-z0-9_:.+-]{0,120}$`.
- 항목 사이 빈 줄 하나. `@type{키,` 모양(`(`는 쓰지 않는다).
- arXiv 찾기: `eprint`가 없는 항목에 사용자가 고른 번호를 적을 때는 그 항목의 닫는 `}` 앞에 `eprint = {번호},`와 `archiveprefix = {arXiv},` 두 줄만 넣고 다른 칸과 글은 그대로 둔다. 이미 `eprint`가 있거나 다른 항목에 같은 번호가 있으면 쓰지 않는다.

## 11. 앱 설정 (연구 저장소 밖)

`~/.config/research-workspace/`(`RW_CONFIG_DIR`로 바꿈). 사용자 컴퓨터마다 다르고 git에 넣지 않는다.

| 파일 | 무엇 |
|---|---|
| `config.yaml` | 등록한 연구(`researches: [{id, path, kind?, fields?, state?, rail?}]`; `rail: true`면 멈춤 · 완료여도 레일에 보인다), `library`, `pdfFolders`, `personalRepo`, `engine`, `ui`, 서식, 사람. 앱이 저장할 때 전체를 다시 쓰므로 주석은 사라진다. 앱이 모르는 맨 위 키(다른 맥의 새 버전이 더한 설정 등)는 저장할 때 그대로 남긴다 |
| `latex-files/` | 앱에 싣지 않는 서식 스타일 파일. `config.yaml` 서식의 `files:`에 적은 이름을 앱의 `templates/latex/`에서 먼저, 없으면 여기서 찾는다 |
| `index/concepts-*.sqlite` | 개념 색인 (지워도 다시 만듦) |
| `figure-cache/` | tikz 그림 캐시 (지워도 됨) |
| `agent-edits/edits-*.json` | 에이전트 고침 기록. 깨지면 `.broken-<시각>`으로 옮기고 새로 시작 |
| `papers-opened.json` | 논문을 연 시각 |
| `personal/`, `backup/` | 개인 저장소·백업 사본 |
| `account-sync.json` | 설치판 계정 동기화(`accountSync.ts`)가 다른 컴퓨터의 프로젝트를 모두 받은 계정 (`restored: [로그인]`). 계정마다 한 번만 받으므로, 뒤에 프로젝트를 빼도 다시 받지 않는다 |

## 12. 고치기 API의 충돌 검사 요약

| 무엇 | 검사 |
|---|---|
| `research.yaml`, `note.yaml`, 원고 부분, 주제(주제 폴더면 `research.yaml`과 `topic.yaml` 함께), 진술, 개념노트, 분류, 매크로 | `baseHash` 필수 → 다르면 409와 `currentHash` |
| 코멘트 고치기·지우기·분류 | 코멘트 파일 `baseHash` |
| 맡긴 일 판단·답·다음 일 | 맡긴 일 파일 `baseHash` |
| 일지 고치기·지우기 | 그 기록의 지금 글 `was` |
| 일지·코멘트·맡긴 일 새로 만들기, 답 넣기 | 없음 (덧붙이기) |
| 프로젝트 개념 넣기·빼기, 주제 그림, 그림 이름·설명(`figures.yaml`), 논문의 관련 프로젝트(`papers.yaml`), 메인 노트 빼기 | 없음. 쓰기 바로 전에 파일을 다시 읽어 그 칸만 바꾼다 (다른 칸·주석은 남는다. 같은 칸을 동시에 고치면 나중 것이 남는다) |
| arXiv PDF 받기 (`materials/<키>.pdf`) | 이미 있으면 409 (덮지 않는다) |
| `STATUS.md` | 없음 (앱만 씀) |

## 13. 결정과 프로젝트 규칙 (`decisions/`, `rules/`, 2026-10-13~)

옛 `GOVERNMENT/Court-Precedents/`(결정)와 그 프로젝트에만 해당하는 `Agents-Bylaws/`(규칙)를 workbench 안으로 옮긴 자리다(2026-10-13 결정 "연구 저장소 폴더" R2·G1). 여러 연구에 공통인 규칙은 저장소마다 두지 않고 관리자 개인 저장소의 `rules/research.md`에 한 번만 둔다(R1). 각 저장소 `AGENTS.md` 첫 줄이 그 파일을 가리키고, 앱은 개인 저장소 사본에서 읽어 `STATUS.md` "공통 규칙" 절(§9)과 MCP `rules`에 보인다.

```
workbench/
  decisions/2026-10-08-lswt-research-notes.md   결정 하나 (왜 그렇게 정했나)
  rules/writing-style.md                        이 프로젝트에만 해당하는 규칙 하나
```

- 파일 이름: 결정은 `^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$`, 규칙은 `^[a-z0-9][a-z0-9-]*\.md$`. 폴더 맨 위만 읽는다.
- 머리말: `title`(없으면 첫 `# 제목`, 그것도 없으면 파일 이름)과 `status`. status는 검토 문서와 같은 말이다: `draft`·`in-progress` 쓰는 중, `in-review` 사용자 검토 대기, `accepted` 승인, `closed`·`superseded` 끝남(`core/review-status.ts`, 옛 이름도 받는다).
- 두 폴더의 문서는 `sources.reviews`에 적지 않아도 검토 문서로 읽는다: `in-review`면 "사용자 검토 대기 문서"에 들어가고 작업 탭의 검토 대기 수에 센다. `in-review`인 규칙도 따르되, 승인된 규칙으로 보고하지 않는다.
- `accepted` 규칙과 결정은 사용자가 허락한 뒤에만 고친다. 결정을 뒤집을 때는 고치지 않고 새 결정을 쓰고 옛 것을 `superseded`로 둔다.
- `STATUS.md` 정본 위치에 두 폴더의 수가, "프로젝트 규칙" 절에 규칙 목록이 보인다(§9). `agent:check`는 이름 모양, 머리말·YAML, `status`, 제목을 본다.
- 앱은 두 폴더를 쓰지 않는다(파일이 바뀌면 작업 탭이 다시 읽기만 한다).

## 14. 옛 연구 흐름 없앰 (2026-11-11)

10/14부터 쓰던 흐름 점(`workbench/flow/<id>.yaml`, 점 하나에 파일 하나)과 그 화면 · 판단 화면 · 판단 대기열, MCP `flow_*` · `finish_work`, `pnpm agent:start` · `agent:integrate`, 맡긴 일의 `flow` 칸, 기록의 `field` · `fieldHash`는 11/11에 없앴다(결정 "옛 흐름 없애기"). 일을 하는 자리는 흐름(§16) 하나다.

- 앱은 `workbench/flow/`를 읽지 않는다. 남아 있는 파일은 그대로 두거나 `archive/`로 옮긴다(앱이 지우지 않는다). 변경사항 화면에는 보통 파일로 보인다.
- 옛 점은 새 흐름으로 바꾸지 않는다. 흐름의 메시지와 독자는 사용자만 쓰기 때문이다.
- 옛 점의 기록 파일 `comments/flow-<id>.md`는 기록 화면에서 그대로 읽힌다(§6.1).
- 옛 형식의 전문은 이 문서의 11/11 전 판(git 이력)에 있다.

## 15. 바뀐 것 검사 (`agent:check`, 2026-10-15~)

`pnpm agent:check <저장소> [--base <ref>]`는 형식 검사에 더해, 기준 커밋 이후 바뀐 파일을 공통 규칙에 비춰 본다(`agentChanges.ts`). 긴 규칙 글 대신 기계가 판정할 수 있는 규칙은 여기서 잡는다.

- **기준:** `--base`로 준 ref, 없으면 origin의 기본 브랜치(`origin/HEAD`, 없으면 `origin/main`·`origin/master`), 그다음 upstream과 갈라진 곳. 모두 없으면 커밋하지 않은 변경만 본다. 기준 뒤 올리지 않은 커밋, 커밋하지 않은 변경, 추적하지 않는 새 파일을 모두 본다.
- 기준 뒤의 **모든 변경**을 본다. 맥에서는 사용자가 앱에서 한 것(커밋 전)도 섞일 수 있으므로, 에이전트는 자기가 바꾼 것만 되돌리고 나머지는 그대로 둔다.
- 오류가 하나라도 있으면 종료 값 1. 줄 끝 `[이름]`이 검사 이름이다.

| 이름 | 무엇 | 기본 |
|---|---|---|
| `frozen-folder` | `sources/`·`archive/`의 있는 파일을 고치거나 지우거나 옮김. 새로 넣는 것과 폴더 맨 위 `README.md`(안내, 옛 경로 → 새 경로 표)는 아래 경고만 | 오류 |
| `locked` | 머리말(또는 YAML) `locked: true`인 파일을 고침 | 오류 |
| `approval` | 노트를 해결로(`note.yaml` `state: done`), 맡긴 일을 `done`으로, `judged`·`answers`를 씀 | 오류 |
| `attempt-skipped` | 진행 중인 흐름(§16)이 있는데, 바꾼 노트를 그 흐름들의 어느 시도도 `files`로 가리키지 않음(11/11, 옛 `flow-skipped`를 바꿈). 진행 중인 흐름이 없으면 보지 않는다. 흐름과 상관없는 손질이면 넘어가도 된다 | 경고 |
| `nonstandard-new-file` | 표준 배치 저장소에서 표준도 `folders:`도 아닌 맨 위 폴더에 새 파일 | 경고 |
| `confirmed-edit` | 해결 노트, `status: accepted` 결정·규칙을 고침 | 경고 |
| `outside-workbench` | `workbench/` 밖 변경 (맨 위 폴더마다 한 줄) | 경고 |
| `move-delete` | 지우거나 옮긴 파일 (한 줄로 묶음) | 경고 |
| `problem-human` | 흐름(§16)에서 사용자만 하는 것: 있는 흐름의 질문 · 메시지(예이면 · 아니오이면) · 독자 · 한도 · 후보 순서 · 상태 · 시작 · 종료를 바꿈, 방향 보고에 결정(`decision`)을 씀, 새 흐름을 제안(`proposed`)이 아닌 상태로 만들거나 메시지 · 독자를 채움, 흐름을 지우거나 옮김, 판정에 `by: user`를 씀 | 오류 |
| `problem-verdict` | 시도의 판정 규칙: 일한 쪽(`worker`)이 자기 시도를 판정, 판정 기록 없이 성립 · 폐기, 보고(`did` · `result`) 없는 시도를 판정, 성립에 `verdict.check` 없음, 검사 명령(`test`)이 있는 시도의 성립에 `verdict.tested: pass` 없음, 해 본 시도의 폐기에 `lesson` 없음 | 오류 |
| `problem-work` | 일하는 규칙: 사용자가 시작하지 않은 흐름 · 종료한 흐름 · 흐름 파일이 없는 폴더에 시도를 씀, 시작한 시도 수가 한도를 넘음, 방향 보고가 결정을 기다리는 동안 시작, 시작한 시도에 `worker` 없음, 보고에 `did` · `result` 없음, 출처 없는 제안, 낸 방향 보고를 고치거나 지움 · 결정 전에 하나 더 냄. 폐기가 이어진 정체와 후보 순서는 앱 · MCP · `pnpm agent:problem`만 막는다 | 오류 |

- **PR 관문** (10/23): 연구 저장소 PR마다 Actions로 이 검사를 돌려 오류가 있으면 PR이 실패한다. 연구 저장소에는 `.github/workflows/agent-check.yml` 하나에 `uses: emergence-project/emergence-workbench/.github/workflows/research-check.yml@main`만 두고(그 파일 머리에 전문), 기준은 PR의 base 브랜치다. 관문은 공통 규칙 파일이 없어 기본 세기로 돈다. 에이전트의 브랜치를 검사하는 것이므로, 사용자가 앱에서 한 판단은 그 브랜치가 아니라 main에 올린다.
- **세기 바꾸기:** 공통 규칙 파일(§9, 설정 폴더의 `personal/rules/research.md` 또는 `RW_COMMON_RULES`) 머리말의 `checks:`가 이름마다 `error` · `warning` · `off`를 정한다. 모르는 이름과 값은 넘어간다.

```yaml
---
title: 연구 공통 규칙
checks:
  attempt-skipped: error   # 흐름이 열려 있으면 시도 없이 노트를 바꾸지 않게
---
```


## 16. 흐름과 시도 나무 (`problems/<흐름>/`, 2026-11-11~)

프로젝트의 "흐름" 화면(왼쪽 사이드바)이 읽는 파일이다(11/11 결정 "흐름과 연구 프로젝트 재설계", `problems.ts` · `routes/problems.ts`). 흐름 하나에 폴더 하나, 그 안에 흐름 파일 `problem.yaml`과 시도 하나에 파일 하나(`<시도 id>.yaml`)를 둔다.

**이름 (11/11):** 11/11부터 "흐름"은 질문과 시도의 줄기를 뜻한다(옛 흐름 점은 §14). 화면의 긴 이름은 프로젝트 종류를 따라 연구는 "연구 흐름 · Research flow", 업무는 "업무 흐름 · Workflow"이고, 짧게는 어디서나 "흐름 · Flow"다. 처음 이름이 "문제"여서 폴더(`workbench/problems/`) · 파일(`problem.yaml`) · API 경로 · MCP 도구(`problem_*`) · 명령(`pnpm agent:problem`) · 검사 이름(`problem-*`)에는 그 말이 남아 있고, 바꾸지 않는다.

- **흐름**은 예 · 아니오로 답할 수 있는 질문 하나다. 사용자가 메시지(답이 예일 때와 아니오일 때 논문에 쓸 한 문장씩)와 독자를 쓰고 시작해야 `open`이 된다(메시지 관문). 에이전트는 흐름을 시작하지 못하고, 일하다 떠오른 질문을 출처와 함께 `proposed`로 올리기만 한다.
- **시도**는 그 흐름을 푸는 방법 하나다. 후보를 먼저 늘어놓고 차례로 해 본다. 성립한 시도 아래로 더 내려가면 나무가 된다.
- **판정**은 일한 쪽이 아닌 쪽이 한다. 성립은 맞춘 조건 밖의 확인(`check`)이, 폐기는 교훈 한 줄(`lesson`)이 있어야 한다.
- **한도와 방향 보고:** 시작한 시도가 한도에 닿거나 폐기가 셋 이어지면 새 시도를 시작하지 못하고, 사실만 적은 방향 보고를 낸 뒤 사용자의 결정(계속 · 좁히기 · 종료)을 기다린다.

```
workbench/problems/
  kempe-degree-five/
    problem.yaml
    a.yaml · b.yaml · b1.yaml · c.yaml
  .trash/<id>-<시각>/          # 시작하지 않은 흐름을 지우면 폴더째 옮긴다. 앱은 읽지 않는다
```

흐름 id는 `^[a-z0-9][a-z0-9-]{0,60}$`(질문의 영문 · 숫자에서 40자까지 만들고, 없으면 `problem`, 겹치면 `-2`). 시도 id는 `^[a-z][a-z0-9]{0,11}$`이고 자리를 뜻한다: 흐름 바로 아래는 `a`, `b`, … , `c` 아래는 `c1`, `c2`, `c1` 아래는 `c1a`. 화면의 이름은 첫 글자를 대문자로 쓴 것(`B1`)이다.

```yaml
# problem.yaml
format: 1
question: 켐페 사슬 바꾸기만으로 차수 5 꼭짓점을 다섯 색 안에서 칠할 수 있는가?
state: open              # proposed 제안 · draft 쓰는 중 · open 진행 · closed 종료
by: user                 # 만든 이: user 또는 에이전트 이름
created: 2026-11-11      # 흐름은 날짜, 그 밖의 시각은 2026-11-11T15:20 꼴
source: heawood1890 3절   # 제안일 때: 어디서 나온 질문인가
if_yes: 평면 그래프의 5색 정리는 켐페 사슬 바꾸기 한 가지로 증명된다.     # 사용자만
if_no: 차수 5 꼭짓점에는 사슬 바꾸기 말고 다른 축약이 필요하다.           # 사용자만
reader: 그래프 색칠 증명을 처음 따라가는 대학원생                         # 사용자만
literature:              # 문헌 대조: 같은 일 · 가까운 일을 한 논문마다 사실 한 줄
  - { ref: heawood1890, fact: 켐페의 4색 증명의 틈을 지적하고 같은 사슬 논증으로 다섯 색을 보였다., by: claude-code, at: 2026-11-11T15:31 }
first_test: 이웃 다섯이 모두 다른 색인 가장 작은 예에서 손으로 확인한다.     # 가장 싸게 방향이 틀렸음을 보일 시험
grading: 차수 5 이하 꼭짓점이 있는 모든 경우를 다룬다.                      # 채점 기준. 없으면 탐색(결과는 사실로만)
limit: 6                 # 해 볼 시도 수. 없으면 6
opened: 2026-11-11T15:40
order: [a, b, c]         # 사용자가 정한 후보 순서 (없으면 만든 순서)
needs: all               # 고르기: 바로 아래 시도가 모두 성립해야 한다(분해). 없으면 시도들은 대안이다
reports:                 # 방향 보고와 사용자의 결정
  - at: 2026-11-12T10:05
    by: claude-code
    why: limit           # limit 한도 · stuck 폐기가 이어짐 · exhausted 후보 없음 · asked 결과가 질문에서 벗어남
    for_yes: "B: 2–4 사슬을 바꾸면 색 2가 빈다."       # "예"의 문장을 받치는 결과 (글 한 덩어리. 없으면 칸을 뺀다)
    for_no: …                                         # "아니오"의 문장을 받치는 결과
    neither: "A: 사슬 하나로는 부족하다."              # 어느 쪽도 아닌 결과
    decision: { at: 2026-11-12T11:00, verdict: continue, note: 차수 4 이하를 마저 적는다, limit: 9 }   # continue · narrow · close
closed: { at: 2026-11-13T09:00, reason: … }   # 종료일 때
```

```yaml
# b1.yaml
format: 1
method: 두 사슬이 교차하지 못함을 조르당 곡선 정리로 적는다
parent: b                # 흐름 바로 아래면 없다
state: reported          # candidate 후보 · active 진행 · reported 판정 대기 · holds 성립 · dropped 폐기
by: claude-code          # 후보를 적은 이
created: 2026-11-11T16:00
worker: claude-code      # 시작한 이 (시작할 때 적는다)
started: 2026-11-11T16:02
did: 평면 그림에서 2–4 사슬의 변이 닫힌 곡선과 만나는 자리를 따졌다.     # 한 일
result: 곡선 위 꼭짓점의 색은 1 · 3뿐이라 만나지 못한다.                  # 결과 (사실)
files: [workbench/topics/coloring/kempe-chains/note.md]                   # 원자료 · 코드 · 노트 (저장소 기준 경로, 폴더도 됨)
run:                                                                     # 실행 (선택): 결과를 낸 명령과 그때의 커밋
  command: python code/kempe_chains.py --graph icosahedron
  commit: 3f2a1b9c0d4e                                                   # 비우면 보고할 때의 HEAD를 앱이 적는다
test: python code/kempe_chains.py --self-test                            # 검사 (선택): 판정하는 쪽이 다시 돌리는 명령
reported: 2026-11-11T17:10
verdict:
  at: 2026-11-11T18:00
  by: codex
  note: 다시 따라가 봤다
  check: 꼭짓점 8개인 다른 그림에서도 같다                               # 성립일 때
  tested: pass                                                           # 검사 명령을 다시 돌린 결과 (pass · fail)
  files: { workbench/topics/coloring/kempe-chains/note.md: 5c1d0e9a77b2 }  # 성립일 때 앱이 적는 파일 지문
lesson: …                # 폐기일 때: 다음 시도가 되풀이하지 않을 것 한 줄
reopen: …                # 고르기: 다시 열 조건
needs: all               # 고르기: 아래 시도가 모두 성립해야 한다
```

- 읽기는 너그럽다: 모르는 칸은 남기고(쓸 때 그대로 둔다), 틀린 값은 그 칸만 버린다. 읽지 못한 파일은 `GET …/problems`의 `diagnostics`로 알린다.
- **누가 쓰나** (`routes/problems.ts`): 부른 쪽은 요청 머리 `x-rw-agent`(MCP 입구가 붙인다)가 있으면 그 에이전트, 없으면 사용자다.

| 하는 일 | 사용자 | 에이전트 |
|---|---|---|
| 흐름 만들기 | 쓰는 중(`draft`) | 제안(`proposed`)만, `source`가 있어야 하고 메시지 · 독자는 거절 |
| 질문 · 메시지 · 독자 · 한도 · 순서 고치기 | 됨 | 거절 |
| 문헌 대조 · 첫 시험 · 채점 | 됨 | 됨 |
| 시작(`open`): 메시지 둘과 독자가 있어야 | 됨 | 거절 |
| 종료, 방향 보고에 결정, 시작 전 흐름 지우기 | 됨 | 거절 |
| 후보 늘어놓기 · 시작 · 보고 | 됨 | 진행 흐름에서만. 순서가 있으면 다음 후보만 시작 |
| 판정 | 됨 | 자기가 일한 시도는 거절 |
| 방향 보고 | 됨 | 됨 |

- **실행과 검사** (11/11 "옛 흐름 없애기" 나, `problemFiles.ts`): 보고의 `run.command`는 결과를 낸 명령(저장소 맨 위에서 돌릴 수 있게), `run.commit`은 그때의 코드다. 명령이나 파일이 있는 보고에서 커밋을 비우면 앱이 저장소의 HEAD 앞 12자를 적는다(git을 부르지 않고 `.git`을 읽는다. 저장소 맨 위에 `.git`이 없으면 적지 않는다). `test`는 판정하는 쪽이 다시 돌리는 검사 명령이고, 그 결과를 판정의 `tested`에 적는다. 검사 명령이 있는 시도는 에이전트가 `tested: pass` 없이 성립을 주지 못하고, `fail`이면 누구도 성립을 주지 못한다. 사용자는 돌리지 않고도 판정할 수 있다(화면에 "다시 돌리지 않음"). 앱은 명령을 돌리지 않는다.
- **판정 후 변경:** 성립으로 판정할 때 앱이 `files`의 경로마다 지문을 `verdict.files`에 적는다(파일은 내용 sha256의 앞 12자, 폴더는 그 안 파일 지문을 모은 값, 없는 경로는 `-`. 숨김 폴더 · `node_modules` · `__pycache__`는 빼고, 파일이 300개를 넘는 폴더는 적지 않는다). 읽을 때 지금 지문과 다르면 응답의 `changed`에 그 경로가 실리고(파일에는 쓰지 않는다), 화면의 "판정 후 변경" 표시와 이어받기 요약의 "판정 뒤에 파일이 바뀐 성립"으로 보인다. 판정을 되돌리지는 않는다: 다시 확인할지는 사람과 다음 에이전트가 정한다.
- **시도의 길:** `candidate` → (시작) `active` → (보고) `reported` → (판정) `holds` · `dropped`. 사용자는 해 보지 않은 후보나 진행 중인 시도도 폐기할 수 있다(후보는 교훈 없이도). 위 시도가 후보이거나 폐기면 그 아래는 시작하지 못한다.
- **다음 후보**(`next`)는 나무에 보이는 순서(위에서 아래, 가지를 먼저 끝까지)에서 시작할 수 있는 첫 후보다. 형제는 `order`의 순서, 그다음 만든 시각 순이다.
- **멈춤**(`stop`, 앞의 것이 먼저): `decision` 방향 보고가 결정을 기다림 · `limit` 시작한 시도 수(`worker`가 있는 시도)가 한도 이상 · `stuck` 마지막 결정 뒤의 판정 가운데 최근 셋이 모두 폐기 · `exhausted` 시작할 후보도 진행 · 판정 대기도 없음. 멈춤이면 시작을 거절한다. 결정이 계속 · 좁히기면 한도를 올린다(준 값, 없으면 쓴 수와 한도 가운데 큰 쪽 + 3).
- **이어받기 요약** (`GET …/problems/:id/brief`, `problemBrief.ts`): 질문 · 메시지 · 독자 · 채점 · 교훈 · 판정 뒤에 파일이 바뀐 성립 · 판정 대기(검사 명령과 함께) · 다음 후보 · 한도를 2KB 안에 싣는다. 넘치면 후보, 성립, 진행 순으로 줄을 줄인다. STATUS(§9)의 "흐름" 절은 진행 중인 흐름을 한 줄씩 싣는다.
- **앱에서 고치기:** `GET · POST …/problems`, `GET · PATCH · DELETE …/problems/:id`, `POST …/problems/:id/open · close · attempts · report · decide`, `POST …/problems/:id/attempts/:aid/start · report · verdict`. 흐름 파일을 고치는 요청(`PATCH` · `open` · `close` · `DELETE`)은 읽을 때 받은 `hash`를 `baseHash`로 보낸다. 시도는 상태로 막으므로(이미 시작한 후보는 다시 시작하지 못한다) hash가 없다.
- **서버 없이 쓰기** (`pnpm agent:problem <저장소> …`, `scripts/agent-problem.mjs`): 앱 · MCP가 닿지 않는 곳(클라우드)에서 에이전트가 같은 함수로 읽고 쓴다. 명령은 MCP 도구와 한 쌍이다: 없음(목록) `problems` · `brief` · `read` · `propose` · `prepare` · `add` · `start` · `report`(`--command` · `--commit` · `--test`) · `verdict`(`--tested pass|fail`) · `direction`. 언제나 에이전트 이름으로 쓰고(`--by`, 기본 `claude`), 사용자만 하는 일(시작 · 종료 · 메시지 · 독자 · 한도 · 순서 · 결정)은 명령이 없다. 쓴 뒤 그 저장소에 커밋해 올린다.
- **파일을 직접 고쳤을 때:** 위 규칙을 어긴 변경은 `pnpm agent:check`가 잡는다(§15의 `problem-human` · `problem-verdict` · `problem-work`). 읽지 못한 흐름 · 시도 파일은 형식 검사의 오류다.

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
- 기록 `comments/block-<id>.md`는 `comments/note-<id>.md`로 옮긴다(Markdown 노트만 기록이 붙는다, §6). 흐름 점·맡긴 일의 `workbench/blocks/…` 경로는 새 본문 경로로 바꾼다. 진술의 `proofs:`는 노트 폴더 이름을 그대로 쓴다.
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
- `완료`: 끝낸 할 일의 글. 다음 줄의 `<!-- rw-todo: <기록 대상>/<기록 id> -->`가 그 할 일 기록을 가리킨다(§6.5). 주제·흐름 점과 경로를 모르는 노트의 할 일은 대상이 `연구`다.
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
| `flow-<id>` | 흐름 점 (흐름 화면에서 점을 고른 채 적은 것, 10/15) |

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
  - `field` · `fieldHash`(10/23 "판단 설계", 짚은 곳)는 흐름 점(`flow-<id>`)의 어느 칸(`fields`의 키 또는 `short` · `title` · `reason` · `next`)에 대한 기록인지와 쓸 때 그 칸 글의 해시다. 앱이 해시를 적는다. 인용이 있으면 그 칸 안의 글이다. 읽을 때 칸이 없어졌거나 인용이 칸에 없으면 "잃음"(`lost`), 칸 글이 바뀌었으면 `changed`로 보인다(파일에 쓰지 않음). 한 질문이 한 줄기다: 짚은 곳마다 따로 묻고 따로 답한다. 에이전트의 답은 첫 줄에 `답: 있음` · `없음` · `일부` 또는 `고침`(점을 고쳤을 때), 다음 줄에 근거(노트 절 · 파일과 행 · 그림)를 적는다. 점을 판단하면(명제 승인 · 기각, 카드 종료) 그 점에 사용자가 남긴 열린 질문 · 지시(`대기` · `답함`)에 앱이 `### 답 · 앱`으로 `판단 뒤 닫음 (승인)` 등을 달고 `끝냄`으로 둔다.
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

- 할 일의 정본은 이 기록 파일이다. 적을 때 일지에는 쓰지 않는다. 할 일은 `project`·노트·주제·흐름 점에 적는다.
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
| `topic`, `flow`, `agent`, `created`, `end-condition`, `avoid`, `result-at`, `conclusion`, `checkpoint`, `checkpoint-at` | 글자 또는 비움. **숫자는 안 된다**(`topic: 123` 오류, 따옴표로 감쌈) |
| `priority` | `1` 먼저 · `2` 보통 · `3` 나중 (2026-10-13~). 없으면 보통. 그 밖의 값은 오류. `STATUS.md` 맡긴 일 절이 이 순서로 보인다 |
| `end-check` | `pass` · `fail` · `unknown` |
| `references`, `outputs` | 글자 목록 |
| `proposal` | `state: proposed`일 때 필수: `{end-condition: [글자…], reason: 글자}` |
| `flow` | 이 일이 다루는 흐름 점 id(§14, 2026-10-26~). **2026-10-30부터 주제(`topic`)나 흐름 점이 있는 맡긴 일은 앱이 작업 점을 만들고 이 칸에 그 점을 적는다**(아래 §14 "맡긴 일이 만드는 작업 점"): 맡길 때 질문 · 명제를 이으면 그 아래에 새 작업 점, 끝나지 않은 작업 점을 이으면 그 점을 이어 받는다(새 점 없음). 주제도 점도 없는 일(앱 · 저장소 손질)은 점을 두지 않고, 그때는 앱이 짝을 찾는다: 점의 `task` 칸이 이 일을 가리키거나, 작업 내용 · 참고 · 종결 조건 · 본문에 `workbench/flow/<id>.yaml` 또는 "흐름 점 <id>"가 있으면 그 점(있는 점만, 폐기한 일은 빼고). 이어진 일은 흐름 찾기(`flow_search`)와 STATUS "흐름 지금"에 결론 · 상태와 함께 보인다. 찾은 짝(`task` 칸 · 글)은 화면에 제안만 하고, 사용자가 "잇기"를 누를 때 이 칸을 쓴다(`POST …/tasks/:id/flow`, `null`이면 지움, 2026-10-27~). 이 칸으로 이은 점이 끝나지 않은 질문 · 작업 점이면 결과를 승인할 때 그 점은 끝남 · 해결이 되고 `conclusion`을 진술로 한 명제 점이 새로 생긴다(`docs/agent-delegated-work.md` 4절) |
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
- 절 차례: 정본 위치 → 공통 규칙 → 폴더와 편집 규칙 → 프로젝트 규칙 → 할 일 → 맡긴 일 → 흐름 지금 → 흐름 요약 → 흐름 지도 → 에이전트 수정 검토 대기 → 대기 중인 질문 → 대기 중인 지시 → 사용자 검토 대기 문서 → 원고 → 주제 → 노트 → 진술 → 자료 → 최근 7일 기록. 비어 있는 선택 절은 생략한다.
- 공통 규칙 절은 모든 연구 저장소에 통하는 규칙 파일(설정 폴더의 개인 저장소 사본 `personal/rules/research.md`, 또는 `RW_COMMON_RULES`가 가리키는 파일)이 있을 때만 보인다. 머리말, 맨 위 `# 제목`, 첫 절 앞의 머리 글을 떼고 절 제목을 한 단계 내린 그대로이고, 파일 경로와 머리말의 `status`, 우선순위(저장소 규칙은 더하거나 더 엄하게만, 그 일에 대한 사용자의 직접 지시가 가장 앞섬)를 안내 줄에 적는다. 앱은 설정 › 공통 규칙에서만 이 파일을 쓴다: 사용자가 저장하면 머리말의 다른 칸은 두고 `status: accepted` · `updated` · `reviewed-by: 사용자` · `reviewed-at`을 오늘로 적고(저장이 확인), 개인 저장소 사본이면 먼저 받은 뒤 이 파일만 커밋해 올린다(커밋 `Update common research rules`, §13).
- 폴더와 편집 규칙 절(§1.1)은 지금 있는 표준 폴더와 `folders:`의 고유 폴더, 그 밖의 맨 위 폴더를 보인다. `workbench/` 말고 표준 폴더가 없고 표준 배치도 쓰지 않으면 생략한다. 프로젝트 규칙 절은 `workbench/rules/`의 규칙을 제목·status와 함께 보인다(§13).
- 흐름 요약 · 흐름 지도 절은 흐름 점(§14)이 있을 때만 보인다. 요약은 첫 줄에 점 수와 상태별 수(해결(정리) · 진행 · 멈춤 · 미해결 · 폐기 · 반증), 그 아래 최근 점 5개(날짜가 새것부터), 최근 5개 밖의 열린 점(미해결 · 진행 · 멈춤), 사람 승인 대기(근거의 증명에 에이전트 검토만 있고 사람 승인이 없는 점), 빈틈(§14, 새것부터 10점)을 싣는다. 열린 점은 설명 칸 · 앞선 점 · 뒤따른 점 · 근거와 확인 기록 · 짐작까지, 끝난 점은 한 줄이다. 점 주소는 기록 대상과 같은 `flow-<id>`다. 지도는 날짜 순으로 점마다 한 줄이고, 열린 점은 "→ 흐름 요약"으로 가리킨다. 짧은 요약에서 흐름 요약은 지금 할 것 절이다(길면 이름만). 홈 · 레일의 수에는 넣지 않는다. **흐름 지금**(2026-10-26~)은 흐름 요약 앞의 짧은 절로, 열린 점 수 · 판정 기준 없는 열린 점 수 · 흐름 점과 잇지 않은 맡긴 일 수, 그리고 열린 점마다 한 줄(기호 · 짧은 제목 · id · 상태 · 기준 없음 · 이어진 맡긴 일과 그 상태, 새것부터 12점)을 싣는다. 짧아서 요약에 늘 그대로 실린다.
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
| `papers/<키>.tex` | 문헌노트 (블록 머리 형식) |
| `references.bib` | 참고문헌. 앱은 끝에 덧붙이고, 사용자가 고른 arXiv 번호만 그 항목에 적는다(10.4) |
| `papers.yaml` | bib 키 → `{projects?, pdf?, subjects?}` |
| `comments/<키>/c-*.md` | 논문 코멘트 (§10.3) |
| `figures/`, `figures/figures.yaml` | 공용 그림 (§8) |
| `subjects.yaml` | 분류 나무 (§10.2) |
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

## 14. 연구 흐름 (`flow/<id>.yaml`, 2026-10-14~)

프로젝트의 "흐름" 화면(왼쪽 사이드바)이 읽는 파일이다. 흐름은 프로젝트 하나에 하나이고 주제는 점에 붙는 태그다(10/14 사용자: 생각은 주제를 넘나든다). 점 하나 = 일 하나(질문 · 계산 · 증명 · 문헌 · 발견 하나, 계산 한 번이 아니다)이고, 점 하나에 파일 하나다.

흐름의 목적(10/20 사용자): (1) 연구 이력 · 근거 · 지난 결과를 사람이 다시 떠올리게, (2) 에이전트가 정한 양식과 절차대로 주장을 검증하게, (3) 논리의 빈틈 · 비약과 무엇을 먼저 하고 왜 멈췄는지 보이게, (4) 같은 실험 · 코딩을 되풀이하지 않게. 그래서 에이전트는 **일을 시작할 때 점을 진행으로 만들고 끝날 때 결과를 적는다**(MCP `flow_add` · `flow_update`, 계산 전에 `flow_search`). 끝남으로 넘어갈 때는 앱이 필수 칸을 검사하고(아래 "해결 문턱"), 빈틈은 앱이 계산한다(아래 "빈틈"). 선은 "어디서 왔나"이며 받는 점에만 적는다. 화면의 자리(열·줄)는 앱이 계산하고(`apps/web/src/flowLayout.ts`), 손으로 옮긴 점만 `layout.yaml`에 적는다. 앱(2단계, 10/14)과 에이전트가 모두 쓴다. 사람이 정하는 것은 질문 문장, 발단 선, 정리 승인(사람 승인 확인 기록), 갈래 폐기다.

**맡긴 일이 만드는 작업 점** (2026-10-30 결정 "흐름 차트 동결 · 카드 입구", `apps/server/src/taskFlow.ts` `createTaskWithDot`): 작업 점은 사람이 차트에서 만들지 않고, 주제나 흐름 점이 있는 맡긴 일(§13)을 맡길 때 앱이 만든다. 점 수 = 맡긴 일 수가 되게. 점의 `kind`는 요청의 `kind`(비우면 `calc`), `short` · `title`은 일 이름, `topics`는 일의 주제, `by`는 맡긴 이(화면은 `user`, MCP `add_task`는 에이전트 이름), `task`는 일 id, `fields.goal`은 작업 내용. 이은 점(`flow`)이 질문이면 발단(`origin`) 선, 명제면 사용(`use`) 선. 종결 조건이 있으면 `progress: active`이고 판정 기준이 그 조건(`criterion` 칸이 있는 종류는 칸에, 없는 종류는 시작 기록에), 없으면 `open`이었다가 종결 조건 제안을 승인할 때 `active`가 되며 기준이 그 조건이 된다. 시작 기록(`start`)에는 선행 찾기의 글과 걸린 점(`hits`)을 앱이 적고(`novel`은 걸린 점이 없을 때 "맡긴 일 … 에서 열림"), 응답(`POST …/tasks`의 `dot` · `hits`, MCP `add_task`의 답)에 걸린 점을 실어 에이전트가 같은 일을 되풀이하기 전에 읽게 한다. 결과를 승인하면 그 점이 끝남 · 해결이 되고 결론이 명제 점이 된다(`docs/agent-delegated-work.md` 4절). 다음 지시를 맡길 때(`POST …/next`)도 같다.

**옛 점** (2026-10-30, `legacy`): 만든 이(`by`)도 시작 기록(`start`)도 없는 점은 앱 · MCP를 거치지 않고 생긴 것이다(10/14–10/21에 에이전트가 일지에서 한 번에 뽑은 추측 178점). `GET …/flow`가 `legacy: true`로 표시하고 빈틈을 세지 않는다(판단 전 옛 결과로만 보인다). 그래서 화면 · STATUS의 빈틈 수는 10/20 뒤 새 일의 빈틈만 가리킨다.

```yaml
format: 1
kind: finding            # question · finding (진술) / calc · analytic · proof · literature (행위)
progress: done           # open 미해결 · active 진행 · paused 멈춤 · done 끝남
result: solved           # done일 때만: solved 해결(성공) · refuted 반증(실패) · dropped 폐기
short: 색 바꾸기          # 차트에 보이는 짧은 제목
title: Kempe 사슬로 다섯째 색을 비울 수 있다
topics: [coloring]       # 주제 id (선택). 흐름 화면의 주제 필터가 이 점을 굵게 보인다
date: 2026-10-02         # 시작일: 앱이 점을 만들 때 적는다. 고치기 창에서는 읽기만, 없던 옛 점은 처음 고칠 때 그날로 (10/21)
ended: 2026-10-05        # 끝난 날: 끝남(해결 · 반증 · 폐기)으로 바꿀 때 앱이 적고, 다시 열면 지운다 (10/21)
by: claude-code          # 한 이: 점을 만든 이. 화면은 user, MCP는 에이전트 이름 (10/21)
task: 2026-10-05-list-coloring-bound   # 이 점을 만든 맡긴 일 id (선택, MCP flow_add의 task, 10/21)
start:                   # 시작 기록 (10/23, pnpm agent:start): 아래 "시작 기록"
  at: 2026-10-02T09:00
  by: claude
  query: Kempe 사슬 다섯째 색   # 선행 찾기에 쓴 글
  hits: [degree-bound, kempe-1879]   # 걸린 점
  prior: [kempe-1879]    # 가장 가까운 기존 결과 · 반례
  adds: 사슬이 서로 막는 경우까지   # 이번에 더할 것 (prior가 있을 때)
  stop: 이틀 안에 반례가 없으면 멈춤   # 멈출 조건 (선택)
from:                    # 앞선 점. type: origin 발단 · support 근거 · refute 반박 · use 사용
  - { id: degree-bound, type: support }   # type이 없으면 질문은 origin, 그 밖은 support
fields:                  # 종류마다 설명 칸 (아래 표). 노트처럼 그린다: $…$ 수식, 따로 한 줄의 $$…$$ 줄 수식, 빈 줄은 문단, ![설명](그림 파일 이름)은 이 프로젝트·공용 그림 (10/15). 여러 줄은 YAML |
  statement: …
  condition: …
run:                     # 수치 계산의 실행 (10/20): 같은 계산을 찾을 수 있게
  code: workbench/topics/coloring/kempe/code/swap.py
  commit: 22a8a72
  params: { n: 12, seed: 3 }   # 이름 → 값 (글로 읽는다)
  output: workbench/topics/coloring/kempe/data/swap.csv
steps:                   # 증명 · 이론 계산의 단계 (10/20). 글 하나만 적어도 된다
  - text: 차수 5 이하인 꼭짓점이 있다
    uses: 오일러 공식           # 이 단계가 쓰는 것 (공리 · 앞 단계 · 점 · 논문)
    checks: [ { at: 2026-10-02T15:00, by: claude, role: agent, hash: 3f…} ]
reason: …                # 반증 · 폐기 · 멈춤의 이유 (10/20)
next: 여섯 색으로 넓히기     # 다음 할 일 (10/20)
priority: high           # high · normal · low
end: true                # 흐름 종료: 이 갈래는 여기서 끝나 뒤에 이어질 점이 없음 (선택, 10/21 "갈래 종결"에서 이름 바꿈)
integration:             # 반영 기록 (10/23, pnpm agent:integrate): 아래 "반영 기록"
  { at: 2026-10-05T18:00, by: claude, into: workbench/notes/overview/note.md, section: 색칠 }   # 또는 skip: <반영하지 않는 이유>
card:                    # 카드 (10/23, 질문 점에만): 아래 "카드"
  givens: [degree-bound]   # 사전 연구: 바탕으로 쓸 명제(발견) 점 id
  terms:                 # 용어: 문장의 기호 · 말과 정의가 있는 곳
    - { word: Δn, def: 소용돌이를 둘 때 n의 변화, ref: workbench/topics/coloring/kempe/note.md#질문 }
  tools: [workbench/topics/coloring/kempe/code/swap.py]   # 도구: 쓸 코드 · 문헌
  assignee: claude-code  # 담당
  findings: 2            # 돌려받을 명제 수의 상한
evidence:                # 근거. ref(라이브러리 논문 키)와 file(저장소 기준 경로) 가운데 하나만
  - kind: proof          # calc · analytic · proof · other · paper
    title: Kempe 사슬     # 보이는 이름 (선택)
    file: workbench/notes/kempe-chains/main.tex
    section: 두 사슬         # 노트 안의 절(제목) 이름 (10/20). 확인 기록의 hash는 이 절의 내용
    text: 두 사슬이 서로 막는 경우까지
    checks:              # 확인 기록 (덧붙이기만): role agent = 에이전트 검토, human = 사람 승인. hash = 확인할 때 그 절(없으면 파일)의 내용 해시
      - { at: 2026-10-02T15:00, by: claude, role: agent, hash: 9a…, claim: 4c… }   # 발견이면 claim = 진술 · 조건의 해시 (10/23)
      - { at: 2026-10-02T22:10, by: 사용자, role: human }
      - { at: 2026-10-03T09:00, by: 사용자, role: human, revoked: true }   # 거두기도 덧붙인다
judgments:               # 사람 판단 (10/23, 덧붙이기만): 아래 "판단"
  - { at: 2026-10-03T10:00, by: user, verdict: send-back, note: 명제를 알 수 없음, claim: 4c… }
  - { at: 2026-10-04T09:00, by: user, verdict: approve, claim: 7d… }
sources: [workbench/log/2026-10-02.md]   # 기록 출처 (일지·노트·커밋)
guesses: [ … ]           # 에이전트가 짐작한 것 (사람이 확인하지 않음)
```

| kind | 이름 | 설명 칸 (`fields`) |
|---|---|---|
| `question` | 질문 (기호 ?; `guess`가 있으면 전구 속 ?) | `question` 물음* · `motivation` 동기* · `guess` 예상 답 · `criterion` 판정 기준* (무엇이 나오면 예 · 아니오인가) |
| `finding` | 명제 (기호 !, 10/23 "판단 설계": 옛 이름 발견. 승인되면 속이 참) | `statement` 진술* · `condition` 조건(성립 범위)* |
| `calc` | 수치 계산 (π) | `goal` 목적* · `criterion` 판정 기준* (기대값 · 허용 오차) · `setup` 설정* · `result` 결과* · `interpretation` 해석. 그리고 `run` |
| `analytic` | 이론 계산 (∫) | `goal` 목적* · `setup` 출발점* · `assumptions` 가정* · `result` 결과*. 그리고 `steps`(선택) |
| `proof` | 증명 (∴) | `goal` 목표(진술)* · `assumptions` 가정* · `method` 방법 · `result` 결과*. 그리고 `steps` |
| `literature` | 문헌 (§) | `reading` 문헌* · `gain` 얻은 것* · `use` 쓰는 곳 |

\* = "해결"로 넘어가기 전에 채울 칸 (`FLOW_REQUIRED`, `packages/core/src/flow-kinds.ts`). 판정 기준 · 가정 · 해석 · 쓰는 곳은 10/20에 더했다.

- **카드** (10/23 결정 "판단 설계", `card` · `CARD_FIELDS` in `packages/core/src/flow-kinds.ts`): 맡기기로 정한 질문 점이다. 새 파일 종류가 아니라 질문 점에 `card`를 더한 것이고, 연구가 아닌 일(정리 · 도구 고치기)은 그대로 맡긴 일(§7)로 맡긴다. 칸 글은 `fields`에 적는다: `question` 질문 · `motivation` 동기 · `guess` 예상 · `criterion` 완료 조건(예) · `criterion_no` 아니오 · `criterion_unclear` 불분명 · `value` 가치(답에 따라 무엇이 바뀌나) · `out_of_scope` 제외 범위 · `budget` 자원(시간 · 계산 장비) · `stop` 중단 조건(멈추고 물을 때) · `deliverable` 보고서(돌려받을 모양). 글이 아닌 것은 `card`에 적는다: `givens` 사전 연구(명제 점 id) · `terms` 용어(`word`, `def` 정의, `ref` 정의가 있는 곳: 노트 경로#절 · 개념노트 · 그림) · `tools` 도구 · `assignee` 담당 · `findings` 돌려받을 명제 수. 판단은 아래 "판단"이고, 시작한 뒤 문제 · 완료 칸(`CARD_LOCKED`: 질문 · 완료 조건 셋)을 바꾸면 시작 판단이 낡아 다시 판단한다. 카드의 상태는 앱이 계산한다: **대기**(승인되지 않은 사전 연구가 있음) · **준비**(사전 연구가 모두 승인돼 시작을 기다림) · **진행**(사람이 시작함) · **종료**. 판단 전 사전 연구로는 시작하지 않는다(시작 판단을 거절). 에이전트는 진행 중인 카드 아래에서만 일(질문이 아닌 점)을 연다. 화면은 점 고치기의 "카드로 맡기기"로 `PATCH …/flow/:id`의 `set.card`를 보낸다(질문 점에만. 새로 고르는 사전 연구는 그 흐름의 명제 점만, 정의 · 출처가 없는 용어는 낱말 하나로 적고, `null`이나 질문이 아닌 종류로 바꾸면 `card`를 뺀다).
- **판단** (10/23 결정 "판단 버튼 말", `judgments`): 사람의 판단 기록이다. 명제(발견)는 `approve` 승인 · `send-back` 수정 · `reject` 기각, 카드가 있는 질문은 `start` 시작 · `send-back` 수정 · `end` 종료. 기각은 결과가 나쁘다는 뜻이 아니라 사실로 받지 않는다는 뜻이다("아니오" 결과도 근거가 맞으면 승인). 앱은 판단한 내용의 해시를 `claim`으로 적는다(발견은 진술 · 조건, 카드는 질문 · 완료 조건). 지금 내용과 `claim`이 다르면 그 판단은 낡고(`stale`), 지금의 판단(`verdict`, 앱이 계산)은 낡지 않은 마지막 판단의 말이다. 없으면 **판단 전**이다(10/23 결정 "정의와 옛 결과": 지금까지의 점은 모두 판단 전). 앱 화면이 `POST …/flow/:id/judge`로 쓰고, 에이전트가 파일에 쓰면 `agent:check`의 `approval`이 잡는다. 근거의 사람 승인(`checks`의 `role: human`)은 근거 하나를 확인한 것이고 판단과 따로다.
- **판단 대기열** (10/23, `judgmentQueue` in `apps/server/src/flowGaps.ts`): 판단 전이거나 수정으로 돌려보낸 명제 가운데, 에이전트가 설계 뒤(`JUDGE_SINCE` = 2026-10-23, 점의 `date`) 낸 것과 끝나지 않은 카드가 사전 연구로 고른 것이다. 옛 명제는 카드가 쓸 때만 오른다. 상한은 `JUDGE_CAP` = 3이고, 차면 에이전트는 새 명제를 내지 못한다(앱 `POST …/flow`와 MCP `flow_add`가 거절하고, 파일로 쓰면 `agent:check`의 `queue-cap`이 잡는다). 낸 명제를 고치거나 반례를 확인하는 일은 된다.
- **해결 문턱** (10/20 사용자 결정, `flowGate` in `apps/server/src/flowGaps.ts`): 점이 이번 저장으로 **끝남이나 멈춤으로 넘어갈 때만** 본다(미해결 · 진행은 빈 칸이 있어도 저장되고, 이미 끝난 옛 점은 빈틈으로만 보인다). 해결: 위 표의 * 칸, 질문이 아니면 절(`section`)이나 논문(`ref`)을 가리킨 근거 하나 이상(발견은 근거 · 사용 선으로도 된다), 수치 계산은 `run.code`, 증명은 단계 하나 이상과 단계마다 `uses`. 반증 · 폐기 · 멈춤: `reason`. 앱 API는 `PATCH`에 `gate: true`가 있을 때 검사하고(MCP · 새 고치기 칸), `agent:check`의 `flow-form`이 파일을 직접 고친 경우를 같은 규칙으로 잡는다.
- **빈틈** (10/20, `computeGaps`): 옛 점(`legacy`, 위)은 빈틈을 세지 않는다. 그 밖의 점마다 앱이 계산해 `GET …/flow`의 `gaps`, STATUS "흐름 요약"의 빈틈 절, MCP `flow_read`에 같은 글로 싣는다. `no-evidence` 해결인데 근거 없음 · `unverified-base` 아무도 확인하지 않은 발견 위에 근거 · 사용 선으로 쌓음 · `no-result` 끝난 계산 · 증명의 결과 칸이 빔 · `no-reason` 이유 없는 반증 · 폐기 · 멈춤 · `no-criterion` 열린 질문 · 계산에 판정 기준 없음 · `no-next` 해결인데 뒤따른 점도 흐름 종료도 다음 할 일도 없음 · `missing-file` 근거 파일 · 절이 없음 · `changed-evidence` 확인한 뒤 근거 절이 바뀜 · `step-gap` 쓰는 것이나 확인이 없는 단계.
- **낡은 확인** (10/20): 확인 기록의 `hash`가 지금 근거 절(단계는 글 · 쓰는 것)의 해시와 다르면 그 확인은 없는 것으로 친다(`stale`). 정리도 풀린다. `hash`가 없는 옛 기록은 그대로 센다.
- **발견은 진술에도 묶인다** (10/23): 발견의 근거를 확인(사람 승인 · 에이전트 검토)하면 앱이 진술 · 조건(`fields.statement` · `condition`)의 해시를 `claim`으로 함께 적는다. 확인한 뒤 진술을 넓히거나 조건을 바꾸면 그 발견의 확인이 모두 낡고(정리도 풀리고, 그 위에 쌓은 점은 `unverified-base`), 빈틈 `changed-evidence` "확인한 뒤 진술 · 조건이 바뀌었다"가 뜬다. 되돌리면 다시 산다. `claim`이 없는 옛 기록은 진술을 보지 않는다.
- **시작 기록** (10/23, `start`, `apps/server/src/flowStart.ts`): 일을 시작하기 전에 거치는 문이다. 계산뿐 아니라 방향 제안 · 논문 평가 · 외부 LLM 의뢰도 점 하나로 시작한다. `pnpm agent:start <저장소> --kind … --short … --criterion …`가 먼저 흐름에서 지난 점을 찾아(`flow_search`와 같은 낱말 찾기) 보이고, 다음이 있어야 점을 진행으로 연다(못 지나면 아무것도 쓰지 않는다): 가장 가까운 점(`--prior`, 있는 점이어야 한다)과 이번에 더할 것(`--adds`), 또는 왜 새로운지(`--novel`, 걸린 것이 없을 때도 한 줄), 그리고 판정 기준(`--criterion`: 질문 · 수치 계산은 `fields.criterion`에, 칸이 없는 종류는 `start.criterion`에). `--dot <id>`는 있는 점에 붙이고, 이미 끝난 점이나 `--late`면 사후 기록(`late: true`)으로 따로 센다. 시작 기록은 점마다 한 번이다. `--search "<글>"`은 찾기만 한다. 서버 없이 파일만 읽고 써서 클라우드에서도 돈다. 쓴 뒤 그 저장소 main에 먼저 올려 맡았음을 알린다. MCP `flow_add`(앱 `POST …/flow/start`, 10/24)도 발견이 아닌 새 점을 같은 문으로 연다(`prior` · `adds` · `novel` · `criterion` · `stop` · `query`). 열림(`open`, 나중에 할 질문)은 아직 시작하지 않은 것이라 만들 때는 문을 건너뛰고 `flow-start` 검사도 보지 않는다. 그 점을 MCP `flow_update`로 시작하면(진행 · 멈춤 · 끝남으로) 그때 같은 문을 지난다(`POST …/flow/start`에 `dot`).
- **반영 기록** (10/23, `integration`): 결과를 만드는 일과 그것을 지금의 이해에 반영하는 일은 다르다. 해결 · 반증으로 끝난 점은 `pnpm agent:integrate <저장소> <점> --into <문서> [--section <절>]`(그 문서 · 절이 점 id를 적어 가리켜야 한다, 예: `flow-<id>`) 또는 `--skip "<이유>"`로 반영 기록을 남긴다. 폐기는 `reason`이 그 몫이라 보지 않는다. `agent:check`의 `flow-integration`이 기록 없이 끝난 점과, 문서 · 절이 없어졌거나 더는 점을 가리키지 않는 기록을 잡는다.
- 파일 이름 `^[a-z0-9][a-z0-9-]*\.yaml$`. 폴더 맨 위만 읽고, `layout.yaml`(손으로 옮긴 자리, 2단계)은 점이 아니다.
- **정리**는 고르지 않는다: 근거에 `kind: proof`이고 마지막 `role: human` 확인 기록이 거둔 것(`revoked: true`)이 아닌 발견이 정리(T)로 보인다. 역할마다 마지막 기록이 지금 상태다.
- 근거로 쓴 논문(`kind: paper`)은 받는 점 이름 뒤 작은 §(둘 이상이면 수)로 보이고 목록은 근거 표에 있다(점 위 § 배지는 10/16에 뺐다). 검토 자체가 다음 걸음을 낳았을 때만 `literature` 점을 만든다.
- 앞선 점이 없는 점 앞에는 시작 표시(▶)가 붙는다. 주제가 달라도 선은 그대로 잇는다.
- **지운 점** (`.trash/`, 2026-10-17~): 앱에서 점을 지우면 점 파일과 그 점의 기록(`comments/flow-<id>.md`)을 `flow/.trash/<id>-<시각>.yaml` · `<id>-<시각>.comments.md`로 옮긴다. 앱은 이 폴더를 읽지 않는다. 되살릴 때는 두 파일을 원래 자리로 손으로 옮긴다.
- **`layout.yaml`** (손으로 옮긴 자리): `dots: { <점 id>: { c: 열, r: 줄 } }`, 그리고 보이는 줄 `rows: { top: <0 이하>, bottom: <0 이상>, names: { <줄>: <이름> } }`(중심선 기준 맨 위·맨 아래 줄, 2026-10-16~. 없으면 앱의 기본 5줄. 앱의 ＋ 줄 · ×가 `PUT /api/researches/:rid/flow/rows`로 쓴다. 점이 있는 줄은 범위 밖이어도 보인다). `names`(2026-10-20~, 고르기)는 줄 이름이며 주제와 따로다: 줄 이름을 바꿔도 주제는 그대로고, 줄 수도 주제 수와 상관없다. 범위 밖으로 나간 줄의 이름은 빠진다. 줄 옮기기(▶나 줄 이름 끌기)는 `PUT …/flow/rows/move { from, to, cells }`이고, 화면이 계산한 지금 자리(`cells`)를 옮긴 뒤 자리로 `dots`에 적고 줄 이름도 함께 옮긴다. (10/14 오전의 주제별 모양 `topics: { <주제>: { <점>: … } } }`도 읽고, 다음에 쓸 때 `dots`로 옮긴다.) `c`는 0부터, `r`은 중심선이 0이고 위가 음수. 적힌 점은 그 칸에, 나머지 점은 그 칸을 피해 자동으로 놓인다. 앱은 점을 끌어 놓을 때 쓰고(`PUT /api/researches/:rid/flow/layout`, 다른 점이 손으로 놓인 칸이면 서로 바꾼다), "자동 자리로"로 푼다.
- **앱에서 고치기** (`routes/flow.ts`): 새 점은 `POST`(파일 이름은 짧은 제목의 영문·숫자, 없으면 `step-<날짜>`, 겹치면 `-2`), 고치기는 `PATCH`(보낸 칸만 바꾸고 주석·모르는 칸은 남긴다. 근거를 고쳐도 같은 `ref`·`file`의 `checks`는 남고, 단계를 고쳐도 같은 자리의 `checks`는 남는다. `progress`가 `done`이 아니면 `result`를 뺀다. `gate: true`면 해결 문턱을 본다), 사람 승인·거두기는 `POST …/check`(근거 `ev`나 단계 `step`에 기록 한 줄 덧붙이기), 에이전트 검토는 `POST …/review`(`by`와 role agent), 점 하나는 `GET …/flow/:id`, 지난 시도 찾기는 `GET …/flow/search?q=`(이어진 맡긴 일의 제목 · 작업 · 결론까지 찾고, 줄마다 `tasks`로 그 일의 상태 · 결론 · 산출물과 짝을 찾은 길 `link`(`field` · `dot` · `text`)를 싣는다, 2026-10-26~), 지우기는 `DELETE`(파일을 지우고 다른 점의 `from`과 `layout.yaml`에서도 뺀다). 쓸 때는 읽을 때 받은 `hash`를 `baseHash`로 보낸다.
- 없는 점을 가리키는 `from`, 틀린 값, `ref`·`file`이 둘 다 있거나 없는 근거는 `GET /api/researches/:rid/flow`의 `diagnostics`로 알린다(그 선은 그리지 않는다).

## 15. 바뀐 것 검사 (`agent:check`, 2026-10-15~)

`pnpm agent:check <저장소> [--base <ref>]`는 형식 검사에 더해, 기준 커밋 이후 바뀐 파일을 공통 규칙에 비춰 본다(`agentChanges.ts`). 긴 규칙 글 대신 기계가 판정할 수 있는 규칙은 여기서 잡는다.

- **기준:** `--base`로 준 ref, 없으면 origin의 기본 브랜치(`origin/HEAD`, 없으면 `origin/main`·`origin/master`), 그다음 upstream과 갈라진 곳. 모두 없으면 커밋하지 않은 변경만 본다. 기준 뒤 올리지 않은 커밋, 커밋하지 않은 변경, 추적하지 않는 새 파일을 모두 본다.
- 기준 뒤의 **모든 변경**을 본다. 맥에서는 사용자가 앱에서 한 것(커밋 전)도 섞일 수 있으므로, 에이전트는 자기가 바꾼 것만 되돌리고 나머지는 그대로 둔다.
- 오류가 하나라도 있으면 종료 값 1. 줄 끝 `[이름]`이 검사 이름이다.

| 이름 | 무엇 | 기본 |
|---|---|---|
| `frozen-folder` | `sources/`·`archive/`의 있는 파일을 고치거나 지우거나 옮김. 새로 넣는 것과 폴더 맨 위 `README.md`(안내, 옛 경로 → 새 경로 표)는 아래 경고만 | 오류 |
| `locked` | 머리말(또는 YAML) `locked: true`인 파일을 고침 | 오류 |
| `approval` | 노트를 해결로(`note.yaml` `state: done`), 맡긴 일을 `done`으로, `judged`·`answers`를 씀, 흐름에 `role: human` 확인 기록이나 판단 기록(`judgments`, 10/23)을 씀 | 오류 |
| `flow-human` | 흐름 점의 질문 문장(`fields.question`)·발단 선(`origin`)을 바꿈, `result: dropped`로 갈래를 폐기 | 오류 |
| `flow-form` | 흐름 점을 끝남 · 멈춤으로 바꿨는데 해결 문턱(§14)의 칸이 빔 | 오류 |
| `flow-skipped` | 노트를 바꿨는데 이번에 바뀐 흐름 점 가운데 그 노트를 근거 · 실행 파일로 가리키거나 주제가 겹치는 것이 없음 (10/20: 점은 일을 시작할 때 만든다. 10/23: 무관한 점만 고쳐도 통과하던 것을 막음). 노트의 주제는 주제 폴더 · `note.yaml` `topics:`, 주제가 없는 노트는 주제가 없는 점과 짝짓는다 | 경고 |
| `flow-start` | 에이전트가 만든 새 점(`by`가 `user`가 아님)에 시작 기록(§14)이 없음. 발견(`finding`)은 일이 아니라 결론이고 열림(`open`)은 아직 시작하지 않아 보지 않는다 | 경고 |
| `flow-integration` | 이번에 해결 · 반증으로 끝난 점에 반영 기록(§14)이 없음, 또는 반영 기록의 문서 · 절이 없거나 점 id를 가리키지 않음 | 경고 |
| `queue-cap` | 에이전트가 새 명제(발견)를 냈는데 판단 대기열(§14)이 상한 3을 넘음 | 오류 |
| `card-not-started` | 에이전트가 만든 새 일(질문이 아닌 점)이 진행 중이 아닌 카드(대기 · 준비 · 종료)에서 이어짐 | 오류 |
| `card-locked` | 시작한 카드의 질문 · 완료 조건(`CARD_LOCKED`)을 바꿈. 사람이 수정으로 돌려보낸 뒤 고친다 | 오류 |
| `card-terms` | 카드의 용어에 정의(`def`)도 출처(`ref`)도 없음 | 경고 |
| `flow-new-dot` | 흐름에 새 점 파일 (`layout.yaml` 빼고). 10/20부터 점은 에이전트가 일을 시작할 때 만드므로 기본은 끔 | 끔 |
| `nonstandard-new-file` | 표준 배치 저장소에서 표준도 `folders:`도 아닌 맨 위 폴더에 새 파일 | 경고 |
| `confirmed-edit` | 해결 노트, `status: accepted` 결정·규칙을 고침 | 경고 |
| `outside-workbench` | `workbench/` 밖 변경 (맨 위 폴더마다 한 줄) | 경고 |
| `move-delete` | 지우거나 옮긴 파일 (한 줄로 묶음) | 경고 |

- **PR 관문** (10/23): 연구 저장소 PR마다 Actions로 이 검사를 돌려 오류가 있으면 PR이 실패한다. 연구 저장소에는 `.github/workflows/agent-check.yml` 하나에 `uses: emergence-project/emergence-workbench/.github/workflows/research-check.yml@main`만 두고(그 파일 머리에 전문), 기준은 PR의 base 브랜치다. 관문은 공통 규칙 파일이 없어 기본 세기로 돈다. 에이전트의 브랜치를 검사하는 것이므로, 사용자가 앱에서 한 판단은 그 브랜치가 아니라 main에 올린다.
- **세기 바꾸기:** 공통 규칙 파일(§9, 설정 폴더의 `personal/rules/research.md` 또는 `RW_COMMON_RULES`) 머리말의 `checks:`가 이름마다 `error` · `warning` · `off`를 정한다. 모르는 이름과 값은 넘어간다.

```yaml
---
title: 연구 공통 규칙
checks:
  flow-skipped: error      # 점 없이 노트를 바꾸지 않게
---
```


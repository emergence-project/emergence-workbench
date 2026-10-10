# 연구 저장소 파일 형식

이 문서는 앱이 디스크에서 **지금 실제로** 읽고 쓰는 파일 형식을 적는다. 사람·에이전트·앱이 같은 파일을 고치므로, 이 형식이 앱의 진짜 계약이다. 파일을 직접 쓰는 에이전트는 이 문서를 따른다.

- 2026-10-10 main 코드에서 옮겨 적었다. 형식은 바꾸지 않았다. 코드와 이 문서가 다르면 지금은 코드가 맞고, 이 문서를 고친다.
- "어긋남"으로 표시한 것은 같은 파일을 코드의 여러 곳이 다르게 읽는 경우다. 앞으로 하나로 맞출 대상이며, 그때까지 파일을 쓰는 쪽은 **모든 읽기가 같은 뜻으로 읽는 가장 좁은 모양**으로 쓴다(각 절의 "쓸 때").
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
| 백업 사본 | 백업 동기화가 `<이름>.github-YYYYMMDD<확장자>`를 원본 옆에 둘 수 있다(`backup.ts`). 일지는 무시하고, 맡긴 일은 이름 오류로 보이고, 코멘트는 별개 대상으로 읽힌다(어긋남). |

### 0.1 머리말 (`---`)

Markdown 파일 첫 줄의 `---`부터 다음 `---`까지를 YAML 머리말로 읽는다. 읽는 코드는 하나다: `packages/core/src/front-matter.ts`의 `frontMatter`(와 `stripFrontMatter` · `frontMatterEnd` · `frontMatterLines`). 서버·화면·`agent:status`가 모두 이것을 쓴다.

- 여는 줄과 닫는 줄은 `---`이고 뒤 공백·탭은 괜찮다. `----`, `---x`는 닫는 줄이 아니다.
- 닫는 줄 뒤는 줄바꿈(`\n`·`\r\n`)이나 파일 끝이다.
- 닫히지 않으면 머리말이 없는 것으로 본다(파일 전체가 본문).
- 파일 앞의 BOM은 받지 않는다.
- 빈 머리말(`---` 바로 다음 줄이 `---`)은 머리말로 보지 않는다.

블록 노트의 머리(`core/block-header.ts`, §3.1)는 80줄 제한과 tex의 `% ---`가 있는 다른 형식이라 따로 읽는다.

**쓸 때:** 첫 줄은 정확히 `---`, 닫는 줄도 정확히 `---`(앞뒤 공백 없음), 닫는 줄 뒤에 줄바꿈, 80줄 이내, BOM 없음.

## 1. 연구 저장소의 배치

연구 저장소 하나 = 프로젝트 하나. 앱은 `<저장소>/workbench/`만 자기 폴더로 쓴다.

```
<저장소>/
  workbench/
    research.yaml        프로젝트 정보 (§2)            사람·에이전트·앱
    preamble.tex         블록 컴파일 머리               사람 (처음 한 번 만들어 줌)
    macros.tex           프로젝트 매크로               사람·앱(노트 복사 때 덧붙임)
    blocks/<id>.md|.tex  블록 노트 (§3)                사람·에이전트·앱(머리만)
    notes/<폴더>/        연구노트 (§4)                 사람·에이전트·앱
    calc/<폴더>/         계산 노트 (§4)                같음
    figures/             프로젝트 그림 (§8)            사람·앱
    log/YYYY-MM-DD.md    일지 (§5)                     앱·사람·에이전트
    tasks/<id>.md        맡긴 일 (§7)                  앱·에이전트
    comments/<대상>.md   코멘트·기록 (§6)              앱
    materials/           내려받은 PDF (안에 .gitignore `*`)  앱·사람
    STATUS.md            자동 요약 (§9)                앱만. 고치지 않는다
    .build/              컴파일 산출물 (.gitignore)     앱만
    .trash/              지운 노트 (15일 뒤 비움)       앱만
  statements/            진술 (블록 머리 형식)
```

- 처음 만들 때(`Workbench.scaffold`) 없는 것만 쓴다: `blocks/`, `research.yaml`(`title`·`question`·`started`), `preamble.tex`, `.gitignore`(`.build/`), `figures/.gitkeep`, `log/.gitkeep`.
- `STATUS.md`를 git에서 빼는 것은 각 연구 저장소의 `.gitignore`가 한다. 앱은 넣어 주지 않는다.
- 저장소 밖에 두는 것: 에이전트 고침 기록, 개념 색인, 그림 캐시, 앱 설정(§11).
- 블록 id `manuscript`·`manuscript-…`는 원고 컴파일 폴더(`.build/manuscript…`)와 겹친다(어긋남). 블록 id로 쓰지 않는다.

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
| `topics` | 주제 목록 (§2.2) | `[]` |
| `sources` | 자료 지도 (§2.1) | |

### 2.1 `sources`

| 키 | 모양 |
|---|---|
| `canon` | `"경로 — 설명"` 목록. 없는 경로·저장소 밖 경로는 버린다. |
| `manuscript` | `"경로.tex — 이름"` 하나 또는 목록. **`.tex`만** 받는다. 첫째가 메인 원고. 이름이 없으면 부모 폴더 이름. |
| `tasks` | 경로 하나. 그 파일의 첫 Markdown 표만 읽는다. |
| `bib` | 경로 하나 또는 목록. 없으면 저장소 맨 위의 `*.bib`. |
| `materials` | 경로 하나 또는 목록. |
| `reviews` | 폴더 목록. 안의 `.md` 중 머리말에 `status:`가 있는 것을 "검토 대기"로 센다(`sources/`·`archive/` 폴더는 건너뜀). |

- 경로와 설명은 `—` 또는 `-` 앞뒤 공백으로 나눈다. 그래서 **경로에 ` - `나 ` — `가 있으면 거기서 잘린다.** 이름에도 `—`·` - `를 쓰지 않는다.
- Markdown 노트는 `manuscript`로 적지 않는다. `notes/`·`calc/`의 노트는 앱이 저절로 원고 후보에 넣는다.

### 2.2 `topics`

```yaml
topics:
  - id: kempe            # [a-z0-9][a-z0-9-]*, 없으면 제목에서 만든다
    title: Kempe 사슬     # 필수, 40자
    description: …       # 200자, 20줄
    parts: [docs/note/a.tex]
    blocks: [kempe-chains]   # 옛 방식의 블록 소속
    manuscript: …
    done: true
    star: true
    preview: { text: …, image: figure:…, color: violet|blue|teal|orange|gray }
```

- 100개까지. 읽지 못하는 항목은 건너뛰고, 앱이 고칠 때도 그 자리에 둔다.
- 노트가 어느 주제에 속하는지는 **노트 쪽**에 적는다(§3 `topics:`, §4 `note.yaml` `topics:`). 앞의 것이 대표 주제다.

### 2.3 쓸 때

- 앱은 YAML 문서로 읽어 해당 키만 고친다(`researchYaml.ts` `editResearchYaml`). 주석과 다른 키는 남는다.
- 예외: 메인 원고 지정(`mainNote.ts`)은 글자를 직접 넣는다. `sources.manuscript`를 흐름 목록(`[…]`)이나 `|`·`>`로 쓰면 앱이 고치지 못한다(409). 블록 목록으로 쓴다.

## 3. 블록 노트 (`blocks/`)

- 파일 `blocks/<id>.md`(기본) 또는 `blocks/<id>.tex`(옛 형식). 둘 다 있으면 `.md`가 이긴다.
- **파일 이름이 id다.** id: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 80자 이내. 머리의 `id:`가 다르면 오류로만 표시한다.

### 3.1 머리

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
| `parent`, `alternatives`, `next` | 블록 나무 |
| `concepts`, `topics` | 개념 id·주제 id 목록 |
| `kind` | `proof calc check summary explore design` |
| `description` | 200자, 20줄 |
| `star` | `true` 또는 없음 |

- 그 밖의 키(예: `grounds:`)는 그대로 둔다. 앱이 머리를 고칠 때 바이트를 지킨다.
- `grounds:`(또는 `% 근거:`)는 파일 어디서든 `^(?:%\s*근거|grounds):` 줄을 찾는다. 값은 `,`·`;`로 나눈 `*.tex` 경로, 파일 이름, `파일.tex#라벨`, `파일.tex#절 제목`. `.tex` 블록에서는 `% 근거:`만 찾힌다(`% grounds:`는 안 됨, 어긋남).
- 앱은 머리만 고치고 본문 바이트는 그대로 둔다. 상태를 바꾸면 그날 일지에 `상태` 기록을 남긴다.

## 4. 연구노트·계산 노트 (`notes/`, `calc/`)

```
workbench/notes/<폴더>/
  note.md 또는 main.tex     본문 (둘 다 있으면 note.md)
  note.yaml                 노트 정보
  note-macros.tex           (복사로 만든 노트) 노트 폴더의 .sty 불러오기
  그 밖의 그림·.bib·\input 파일
```

- id는 폴더 이름이다. 앱이 만들 때는 이름을 ASCII로 줄인 40자(`slugOf`), 겹치면 `-2`, `-3`.
- **노트 정보는 `note.yaml`에만 적는다.** `note.md`의 머리말은 건너뛰고 아무 키도 읽지 않는다. (블록 노트는 반대로 파일 머리에 적는다, §3.)

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
| `kind` | `proof calc check summary explore design`. `calc/`는 없으면 `calc`. `none`은 분류 안 함 |
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

## 5. 일지 (`log/YYYY-MM-DD.md`)

```
# 2026-09-30

## 09:40 · 상태 · discharging
진행 중 → 막힘

## 11:20 · 할 일 · kempe-chains
- [ ] 식 (3.5)의 유일성 조건 적기
<!-- rw-todo: project/c-20261007-1234 -->

## 16:05 · 완료 · kempe-chains
식 (3.5)의 유일성 조건 적기
```

- 파일 이름이 날짜(`^\d{4}-\d{2}-\d{2}\.md$`)인 것만 읽는다.
- 기록 머리: `## H:MM · <종류> · <대상>`. `·`는 U+00B7. 종류는 `메모` · `할 일` · `상태` · `완료` 넷뿐(**한국어 글자로 찾는다**). 대상은 `연구`, 블록 id, 노트·원고 경로.
- 다른 `#`·`##` 줄은 기록을 끝내고, 그 뒤 글은 다음 기록 머리까지 버린다. `###`부터는 본문이다.
- 할 일: 본문 첫 줄이 `- [ ] ` 또는 `- [x] `. 연결된 할 일은 다음 줄에 정확히 `<!-- rw-todo: <코멘트 대상>/<코멘트 id> -->`(§6.5).
- 할 일 앞머리의 `M/D` 또는 `YYYY-M-D`(뒤에 공백·`까지`·끝)를 마감으로 읽는다.
- 앱은 기록을 파일 끝에만 덧붙인다. 기록은 파일 안의 차례(0부터)로 가리키고, 고칠 때 그 기록의 지금 글(`was`)이 같은지 본다(hash 대신).
- `상태` 기록은 고치거나 지울 수 없다. `완료` 기록은 지우기만 된다.

## 6. 코멘트·기록 (`comments/<대상>.md`)

노트·PDF·원고에 단 메모·할 일·질문·하이라이트. **노트 파일은 고치지 않고** 여기에 위치(인용·앞뒤 글·줄)로 붙인다.

### 6.1 대상 이름

`^[a-z]+(?:-[A-Za-z0-9._-]{1,160})?$`, `..` 없음.

| 대상 | 무엇에 |
|---|---|
| `project` | 프로젝트 전체 |
| `note-<폴더>`, `calc-<폴더>` | 노트 |
| `block-<id>` | 블록 노트 |
| `paper-<PDF 이름>` | 자료 PDF |
| `manuscript`, `manuscript-<키>` | 원고 PDF |
| `statement-<id>` | 진술 |

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
- 종류: `메모` · `할 일` · `질문` · `하이라이트`. `코멘트`와 모르는 종류는 `메모`로 읽는다.
- 위치: `p.N`(PDF 쪽), `L<n>`(줄), `전체`.
- 상태 줄 `- 상태: <대기|답함|끝냄>`: 질문은 셋 다, 할 일은 `대기`·`끝냄`, 다른 종류는 없음. 기록 안 어디에 있어도 되고 마지막 것이 이긴다.
- 정보 줄 `<!-- rw: {JSON} -->`과 인용 `> "…"`은 머리 바로 아래, 본문 글보다 앞에만 둔다.
  - JSON 키: `rects`(PDF 점, 왼쪽 위 기준 `[x,y,w,h]`), `color`(`yellow green blue pink`), `line`, `prefix`·`suffix`(각 32자), `quoteMultiline`, `unsorted`, `split`, `journal`, `journalIndex`.
- 답: `### 답 · <누가> · YYYY-MM-DD HH:MM` 아래 본문, 그리고 상태 줄.
- 본문의 줄이 `#`, 상태 줄, 정보 줄처럼 보이면 앞에 `\`를 붙여 쓴다.

### 6.3 쓸 때

- 새 기록은 파일 끝에 덧붙인다(hash 없음). 답도 hash 없이 그 기록 끝에 넣는다.
- 고치기·지우기는 파일 전체의 `baseHash`가 필요하다. 바꾸는 기록 밖의 바이트는 그대로 둔다.
- 답이 달린 기록은 지울 수 없다.
- 에이전트가 질문에 답할 때: 그 기록 끝에 `### 답 · <이름> · <시각>`과 본문, `- 상태: 답함`을 덧붙인다. 다른 기록은 고치지 않는다.

### 6.4 위치 다시 찾기

인용이 있고 쪽이 없는 기록은 읽을 때마다 원본에서 `prefix+quote+suffix`, 안 되면 `quote`를 저장된 줄에서 가장 가까운 곳으로 찾는다. 못 찾으면 "잃음"으로 보인다. 파일에 다시 쓰지는 않는다.

### 6.5 할 일과 일지의 연결

할 일 기록을 만들면 그날 일지에도 할 일을 쓰고 `rw-todo` 줄로 잇는다(`<대상>/<id>`). 한쪽을 고치면 앱이 두 파일을 함께 고친다.

## 7. 맡긴 일 (`tasks/<id>.md`)

규칙 문서는 [agent-delegated-work.md](agent-delegated-work.md). 여기서는 형식만 적는다.

- 파일 이름: `^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$`.
- 머리말: §0.1의 "쓸 때" 모양. 최소 한 줄.
- **머리말에 오류가 하나라도 있으면 그 일은 화면에서 사라지고 오류로만 보인다.**

| 키 | 모양 |
|---|---|
| `title`, `task` | 필수, 비지 않은 글자 |
| `state` | 필수: `working` · `proposed` · `result` · `done` · `paused` · `stopped` |
| `topic`, `agent`, `created`, `end-condition`, `avoid`, `result-at`, `conclusion` | 글자 또는 비움. **숫자는 안 된다**(`topic: 123` 오류, 따옴표로 감쌈) |
| `end-check` | `pass` · `fail` · `unknown` |
| `references`, `outputs` | 글자 목록 |
| `proposal` | `state: proposed`일 때 필수: `{end-condition: [글자…], reason: 글자}` |
| `ask` | 3개까지: 글자 또는 `{q, options?: [글자]}` |
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
- 같은 내용을 `pnpm agent:status <저장소>`로 파일 없이 볼 수 있다.

## 10. 공용 라이브러리 (research-library)

앱 설정의 `library:`가 가리키는 폴더. 경로에 공백·`{}%\#~$^&`가 있으면 라이브러리 기능이 꺼진다. 라이브러리 자체의 작성 규칙은 그 저장소의 README가 정본이고, 여기서는 앱이 읽고 쓰는 모양만 적는다.

| 경로 | 무엇 |
|---|---|
| `concepts/<id>.md` | 개념노트 (§10.1) |
| `concepts/<id>.memo.md` | 개념노트 옆 메모. 머리말 없는 자유 Markdown. 비우면 파일을 지운다 |
| `concepts/<id>.tex` | 옛 LaTeX 개념노트 (블록 머리 형식). 같은 id의 `.md`가 있으면 숨김 |
| `concepts/macros.tex` | 공용 매크로 |
| `concepts/attachments/` | 개념노트 그림 |
| `papers/<키>.tex` | 문헌노트 (블록 머리 형식) |
| `references.bib` | 참고문헌. 앱은 끝에 덧붙이기만 한다 |
| `papers.yaml` | bib 키 → `{projects?, pdf?, subjects?}` |
| `comments/<키>/c-*.md` | 논문 코멘트 (§10.3) |
| `figures/`, `figures/figures.yaml` | 공용 그림 (§8) |
| `subjects.yaml` | 분류 나무 (§10.2) |
| `to-learn.yaml` | 공부할 것 |
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
- 프로젝트 코멘트(§6)와 쪽 번호·좌표 기준이 다르다(어긋남).
- 고치기·지우기의 `baseHash`는 그 키 폴더의 모든 코멘트 파일을 이은 것의 hash다.

### 10.4 `references.bib`에 덧붙일 때

- 키: 첫 저자 성(ASCII 소문자) + 제목 첫 낱말(첫 글자 대문자) + 연도, 겹치면 `a`~`z`. `^[A-Za-z0-9][A-Za-z0-9_:.+-]{0,120}$`.
- 항목 사이 빈 줄 하나. `@type{키,` 모양(`(`는 쓰지 않는다).

## 11. 앱 설정 (연구 저장소 밖)

`~/.config/research-workspace/`(`RW_CONFIG_DIR`로 바꿈). 사용자 컴퓨터마다 다르고 git에 넣지 않는다.

| 파일 | 무엇 |
|---|---|
| `config.yaml` | 등록한 연구(`researches: [{id, path, kind?, fields?, state?}]`), `library`, `pdfFolders`, `personalRepo`, `engine`, `ui`, 서식, 사람. **앱이 저장할 때 전체를 다시 쓰므로 주석과 모르는 키는 사라진다** |
| `index/concepts-*.sqlite` | 개념 색인 (지워도 다시 만듦) |
| `figure-cache/` | tikz 그림 캐시 (지워도 됨) |
| `agent-edits/edits-*.json` | 에이전트 고침 기록. 깨지면 `.broken-<시각>`으로 옮기고 새로 시작 |
| `papers-opened.json` | 논문을 연 시각 |
| `personal/`, `backup/` | 개인 저장소·백업 사본 |

## 12. 고치기 API의 충돌 검사 요약

| 무엇 | 검사 |
|---|---|
| `research.yaml`, 블록 노트, `note.yaml`, 원고 부분, 주제, 진술, 개념노트, 분류, 매크로 | `baseHash` 필수 → 다르면 409와 `currentHash` |
| 코멘트 고치기·지우기·분류 | 코멘트 파일 `baseHash` |
| 맡긴 일 판단·답·다음 일 | 맡긴 일 파일 `baseHash` |
| 일지 고치기·지우기 | 그 기록의 지금 글 `was` |
| 일지·코멘트·맡긴 일 새로 만들기, 답 넣기 | 없음 (덧붙이기) |
| 프로젝트 개념 넣기·빼기, 주제 그림, 그림 이름·설명(`figures.yaml`), 논문의 관련 프로젝트(`papers.yaml`), 메인 노트 빼기 | 없음. 쓰기 바로 전에 파일을 다시 읽어 그 칸만 바꾼다 (다른 칸·주석은 남는다. 같은 칸을 동시에 고치면 나중 것이 남는다) |
| arXiv PDF 받기 (`materials/<키>.pdf`) | 이미 있으면 409 (덮지 않는다) |
| `STATUS.md` | 없음 (앱만 씀) |

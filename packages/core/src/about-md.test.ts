import { describe, expect, it } from 'vitest'
import { aboutGlobMatch, aboutInline, aboutLineText, aboutYaml, parseAboutMd } from './about-md.js'

const SAMPLE = `---
id: edits
title: { ko: 수정 검토, en: Edit review }
summary:
  ko: 고친 곳을 문단마다 봅니다: 전과 후.
  en: "Review: before and after."
code:
  - apps/web/src/AgentEditsPage.tsx
  - apps/server/src/agentEdits*.ts
mcp: [edit_note, list_edit_reviews]
prs: [103, 137]
---
<!-- ko -->
- 첫 항목 **굵게** \`코드\` [링크](#/about/agents)
  이어지는 줄

- 둘째 \\\`그대로\\\`
### 지킬 것
- 깨면 안 됨
### 결정
- 2026-11-16 제안으로
<!-- en -->
- First **bold**
  more

- Second
### Keep
- Must hold
### Decisions
- 2026-11-16 suggestions
`

describe('소개 절 파일 (.md)', () => {
  it('머리말과 두 언어 본문을 읽는다', () => {
    const m = parseAboutMd(SAMPLE)
    expect(m).toMatchObject({ id: 'edits', title: { ko: '수정 검토', en: 'Edit review' }, mcp: ['edit_note', 'list_edit_reviews'], prs: [103, 137] })
    expect(m.summary).toEqual({ ko: '고친 곳을 문단마다 봅니다: 전과 후.', en: 'Review: before and after.' })
    expect(m.code).toEqual(['apps/web/src/AgentEditsPage.tsx', 'apps/server/src/agentEdits*.ts'])
    expect(m.ko.items.map(aboutLineText)).toEqual(['첫 항목 굵게 코드 링크 이어지는 줄', '둘째 `그대로`'])
    expect(m.ko.keep.map(aboutLineText)).toEqual(['깨면 안 됨'])
    expect(m.en.decisions.map(aboutLineText)).toEqual(['2026-11-16 suggestions'])
    expect(m.en.items).toHaveLength(m.ko.items.length)
  })

  it('하위 항목: 지금 동작의 항목 밑에 두 칸 들여 "- " (11/27 용어의 위계)', () => {
    const md = ['---', 'title: { ko: 용어, en: Terms }', '---', '- **프로젝트** 연구 하나', '  - **주제** 소주제', '    이어지는 줄', '  - **노트** 문서', '- **설정**', '<!-- en -->', '- Project', '  - Topic', '- Settings'].join('\n')
    const m = parseAboutMd(md)
    expect(m.ko.items.map(aboutLineText)).toEqual(['프로젝트 연구 하나', '설정'])
    expect(m.ko.sub.map((xs) => xs.map(aboutLineText))).toEqual([['주제 소주제 이어지는 줄', '노트 문서'], []])
    expect(m.en.sub.map((xs) => xs.length)).toEqual([1, 0])
    expect(() => parseAboutMd(md.replace('- **프로젝트** 연구 하나', '### 지킬 것\n- 하나'))).toThrow(/하위 항목/)
  })

  it('한 줄 안의 굵게 · 코드 · 링크', () => {
    expect(aboutInline('a **b `c`** [d](#/x) e')).toEqual(['a ', { b: ['b ', { code: 'c' }] }, ' ', { a: ['d'], href: '#/x' }, ' e'])
  })

  it('모르는 칸 · 머리말 없음은 오류', () => {
    expect(() => parseAboutMd('본문만')).toThrow()
    expect(() => parseAboutMd('---\ntitle: { ko: a, en: b }\n---\n### 기타\n- x\n<!-- en -->\n- y')).toThrow(/모르는 칸/)
    expect(() => aboutYaml('이상한 줄')).toThrow()
  })

  it('glob', () => {
    expect(aboutGlobMatch('apps/server/src/agentEdits*.ts', 'apps/server/src/agentEditsDiff.ts')).toBe(true)
    expect(aboutGlobMatch('apps/server/src/agentEdits*.ts', 'apps/server/src/x/agentEdits.ts')).toBe(false)
    expect(aboutGlobMatch('apps/web/src/styles/**', 'apps/web/src/styles/a/b.css')).toBe(true)
    expect(aboutGlobMatch('apps/**/Problem*.tsx', 'apps/web/src/ProblemChart.tsx')).toBe(true)
  })
})

describe('소개 절 파일: 말없이 글이 바뀌지 않는다 (검토 11/27)', () => {
  const head = (y: string) => `---\ntitle: { ko: a, en: b }\n${y}\n---\n- x\n<!-- en -->\n- y\n`
  it('값 안의 # · 따옴표 · 숫자 모양 글은 그대로', () => {
    expect(parseAboutMd(head('summary:\n  ko: 이슈 #12 참조\n  en: "Flow" and "x"\nid: 007')).summary).toEqual({ ko: '이슈 #12 참조', en: '"Flow" and "x"' })
    expect(parseAboutMd(head('id: 007')).id).toBe('007')
    expect(parseAboutMd(head('title2: a #b')).title.ko).toBe('a')
  })
  it('{ } 안에 쉼표가 든 값은 오류', () => {
    expect(() => parseAboutMd('---\ntitle: { ko: 쓰기, 읽기, en: Write }\n---\n- x\n<!-- en -->\n- y\n')).toThrow(/쉼표/)
  })
  it('항목이 아닌 줄 · en 줄 개수는 오류', () => {
    const t = (b: string) => () => parseAboutMd(`---\ntitle: { ko: a, en: b }\n---\n${b}`)
    expect(t('- x\n이어짐\n<!-- en -->\n- y')).toThrow(/항목/)
    expect(t('- x\n\n  떨어진 줄\n<!-- en -->\n- y')).toThrow(/항목/)
    expect(t('- x\n---\n<!-- en -->\n- y')).toThrow(/항목/)
    expect(t('- x\n<!-- en -->\n- y\n<!-- en -->\n- z')).toThrow(/하나/)
    expect(t('- x')).toThrow(/하나/)
  })
})

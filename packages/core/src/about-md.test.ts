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

  it('한 줄 안의 굵게 · 코드 · 링크', () => {
    expect(aboutInline('a **b `c`** [d](#/x) e')).toEqual(['a ', { b: ['b ', { code: 'c' }] }, ' ', { a: ['d'], href: '#/x' }, ' e'])
  })

  it('모르는 칸 · 머리말 없음은 오류', () => {
    expect(() => parseAboutMd('본문만')).toThrow()
    expect(() => parseAboutMd('---\ntitle: { ko: a, en: b }\n---\n### 기타\n- x')).toThrow(/모르는 칸/)
    expect(() => aboutYaml('이상한 줄')).toThrow()
  })

  it('glob', () => {
    expect(aboutGlobMatch('apps/server/src/agentEdits*.ts', 'apps/server/src/agentEditsDiff.ts')).toBe(true)
    expect(aboutGlobMatch('apps/server/src/agentEdits*.ts', 'apps/server/src/x/agentEdits.ts')).toBe(false)
    expect(aboutGlobMatch('apps/web/src/styles/**', 'apps/web/src/styles/a/b.css')).toBe(true)
    expect(aboutGlobMatch('apps/**/Problem*.tsx', 'apps/web/src/ProblemChart.tsx')).toBe(true)
  })
})

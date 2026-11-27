import { describe, expect, it } from 'vitest'
import { aboutEntries, aboutFind, aboutList, aboutListLine, aboutNorms, aboutText } from './about-guide.js'

const md = (id: string, code: string, mcp = '') => [
  '---', `id: ${id}`, `title: { ko: 제목 ${id}, en: Title ${id} }`, 'summary:', `  ko: 요약 ${id}`, `  en: Summary ${id}`,
  'code:', `  - ${code}`, ...(mcp ? [`mcp: [${mcp}]`] : []), '---',
  '- 동작 한 줄', '### 지킬 것', '- 깨면 안 되는 것', '### 결정', '- 2026-11-27 결정', '<!-- en -->', '- One line', '### Keep', '- Keep this',
].join('\n')

describe('에이전트에게 건네는 소개 (about-guide)', () => {
  const { entries, errors } = aboutEntries([
    { key: 'project/edits', text: md('edits', 'apps/server/src/agentEdits*.ts', 'edit_note') },
    { key: 'project/flow', text: md('flow', 'apps/web/src/problem/**') },
    { key: 'home/broken', text: '---\ntitle: x\n---\n' },
  ])

  it('틀린 파일은 오류로 따로, 나머지는 키 순서로', () => {
    expect(entries.map((e) => e.key)).toEqual(['project/edits', 'project/flow'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^home\/broken: /)
  })

  it('절 키 · id · 쪽 · 파일 · 도구로 찾는다', () => {
    const keys = (q: Parameters<typeof aboutFind>[1]) => aboutFind(entries, q).map((e) => e.key)
    expect(keys({ section: 'project/edits' })).toEqual(['project/edits'])
    expect(keys({ section: 'flow' })).toEqual(['project/flow'])
    expect(keys({ section: 'project' })).toEqual(['project/edits', 'project/flow'])
    expect(keys({ file: 'apps/server/src/agentEditsStore.ts' })).toEqual(['project/edits'])
    expect(keys({ file: './apps/web/src/problem/a/b.tsx' })).toEqual(['project/flow'])
    expect(keys({ file: 'apps/web/src/App.tsx' })).toEqual([])
    expect(keys({ tool: 'edit_note' })).toEqual(['project/edits'])
    expect(keys({})).toHaveLength(2)
  })

  it('짧은 글은 요약과 지킬 것만, 전문은 동작 · 결정 · 구현 · MCP까지', () => {
    const e = entries[0]!
    expect(aboutListLine(e)).toBe('- project/edits · 제목 edits — 요약 edits')
    const short = aboutText(e)
    expect(short).toContain('요약 edits')
    expect(short).toContain('- 깨면 안 되는 것')
    expect(short).not.toContain('동작 한 줄')
    const full = aboutText(e, { full: true })
    expect(full).toContain('### 지금 동작\n- 동작 한 줄')
    expect(full).toContain('### 결정\n- 2026-11-27 결정')
    expect(full).toContain('- apps/server/src/agentEdits*.ts')
    expect(full).toContain('### MCP\n- edit_note')
    expect(aboutText(e, { lang: 'en', full: true })).toContain('### Keep\n- Keep this')
  })

  it('절 종류: 옛 키(was)로도 찾고, 목록은 규범 · 참조 · 기능 순, 규범은 짧은 글에도 원칙을 넣는다 (11/27 Fable 안)', () => {
    const norm = ['---', 'kind: norm', 'title: { ko: 작업 원칙, en: Working }', 'summary:', '  ko: 늘 지킨다', '  en: Always', '---', '- 원칙 하나', '<!-- en -->', '- One principle'].join('\n')
    const ref = ['---', 'kind: reference', 'title: { ko: 용어, en: Terms }', 'was: [principles/status-and-turns]', 'summary:', '  ko: 말뜻', '  en: Words', '---', '- 낱말', '<!-- en -->', '- Word'].join('\n')
    const { entries: all, errors: bad } = aboutEntries([
      { key: 'project/edits', text: md('edits', 'apps/server/src/agentEdits*.ts') },
      { key: 'principles/working-principles', text: norm },
      { key: 'principles/definitions', text: ref },
    ])
    expect(bad).toEqual([])
    expect(aboutFind(all, { section: 'principles/status-and-turns' }).map((e) => e.key)).toEqual(['principles/definitions'])
    expect(aboutNorms(all).map((e) => e.key)).toEqual(['principles/working-principles'])
    const list = aboutList(all)
    expect(list.indexOf('working-principles')).toBeLessThan(list.indexOf('definitions'))
    expect(list.indexOf('definitions')).toBeLessThan(list.indexOf('project/edits'))
    expect(aboutText(all.find((e) => e.md.kind === 'norm')!)).toContain('- 원칙 하나')
    expect(aboutEntries([{ key: 'x/y', text: norm.replace('kind: norm', 'kind: rule') }]).errors[0]).toMatch(/kind/)
  })
})

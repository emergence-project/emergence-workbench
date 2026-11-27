import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { aboutGlobMatch } from '@rw/core'
import { ABOUT_MD } from './about/md'
import { ABOUT_PARTS_EN, ABOUT_PARTS_KO, COLOR_ROWS_EN, COLOR_ROWS_KO, SYMBOL_GROUPS_EN, SYMBOL_GROUPS_KO, type AboutPart, withPrFragments } from './aboutContent'

// 소개 글은 절 파일마다 두 언어(ko · en)가 함께 있다. 영어 쪽 data-ui는 같은 자리의 한국어 제목을 쓰므로(withUi) 모양이 같아야 한다
const shape = (parts: AboutPart[]) => parts.map((p) => ({
  id: p.id,
  open: p.open?.map((o) => o.to),
  left: p.left?.length ?? 0,
  sections: (p.sections ?? []).map((s) => ({ id: s.id, figure: !!s.figure, items: s.items.length, ask: !!s.ask, keep: s.keep?.length ?? 0, decisions: s.decisions?.length ?? 0, summary: !!s.summary })),
}))
const icons = Object.fromEntries(['pencil', 'trash', 'play', 'download', 'comment', 'approve', 'sendBack', 'memo', 'feedback', 'panelLeft', 'more', 'reopen', 'search'].map((k) => [k, k])) as Parameters<typeof SYMBOL_GROUPS_KO>[0]['icons']

describe('소개 두 언어', () => {
  it('쪽 · 절 · 항목 · 물음이 같은 자리에 있다', () => {
    expect(shape(ABOUT_PARTS_EN)).toEqual(shape(ABOUT_PARTS_KO))
  })
  it('색 표와 기호 표의 줄이 같다', () => {
    expect(COLOR_ROWS_EN.map((r) => [r.status, r.token])).toEqual(COLOR_ROWS_KO.map((r) => [r.status, r.token]))
    const rows = (g: ReturnType<typeof SYMBOL_GROUPS_KO>) => g.map((x) => x.rows.length)
    expect(rows(SYMBOL_GROUPS_EN({ icons }))).toEqual(rows(SYMBOL_GROUPS_KO({ icons })))
  })
})

describe('소개와 업데이트 1대1', () => {
  it('업데이트(PR)가 고친 절을 찾는다', async () => {
    const { aboutChangesOf } = await import('./aboutContent')
    const refs = aboutChangesOf(94)
    expect(refs).toContainEqual({ part: 'symbols', anchor: 'tags', label: '기호와 의미 › 대화 태그' })
    expect(aboutChangesOf(1)).toEqual([])
  })
})

describe('PR 번호 조각 about/prs/<번호>.json (11/20)', () => {
  const sec = { title: '흐름', id: 'flow', prs: [90, 12], items: [] }
  const other = { title: '편집', items: [] }
  const parts = [{ id: 'project', title: '과제', sub: '', sections: [sec, other] }] as AboutPart[]
  const files = { './about/project/flow.tsx': { ko: sec }, './about/project/edits.tsx': { ko: other } }
  it('조각의 번호를 그 절의 prs에 합친다 (차례대로, 겹치면 하나)', () => {
    const out = withPrFragments(parts, files, { './about/prs/95.json': ['project/flow'], './about/prs/90.json': ['project/flow'] })
    expect(out[0]!.sections![0]!.prs).toEqual([12, 90, 95])
    expect(out[0]!.sections![1]!.prs).toBeUndefined()
  })
  it('조각이 없으면 그대로', () => {
    expect(withPrFragments(parts, files, {})).toBe(parts)
  })
  it('있는 조각은 모두 있는 절을 가리키고 그 절에 번호가 붙는다', () => {
    const frags = import.meta.glob<string[]>('./about/prs/*.json', { eager: true, import: 'default' })
    const sections = Object.keys(import.meta.glob('./about/*/*.{tsx,md}')).map((f) => f.match(/([^/]+\/[^/]+)\.(?:tsx|md)$/)![1])
    for (const [f, keys] of Object.entries(frags)) {
      const n = Number(f.match(/(\d+)\.json$/)![1])
      for (const k of keys) {
        expect(sections, `${f}: ${k}`).toContain(k)
        const [part] = k.split('/')
        expect(ABOUT_PARTS_KO.find((p) => p.id === part)?.sections?.some((s) => s.prs?.includes(n)), `${f}: ${k}`).toBe(true)
      }
    }
  })
})

// 11/27 "소개를 에이전트가 읽는 정본으로": .md 절은 요약 한 줄과 구현 파일이 반드시 있고, 구현 glob은 저장소의 파일에 맞아야 한다
describe('소개 .md 절', () => {
  const root = path.resolve(__dirname, '../../..')
  const files = (dir: string): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) => e.name === 'node_modules' || e.name.startsWith('.') ? [] : e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`])
  const all = ['apps/web/src', 'apps/server/src', 'packages/core/src'].flatMap(files)
  it('요약과 구현 파일이 있고, glob마다 맞는 파일이 있다', () => {
    expect(ABOUT_MD.size).toBeGreaterThan(0)
    for (const [key, m] of ABOUT_MD) {
      expect(m.summary?.ko && m.summary.en, `${key}: summary`).toBeTruthy()
      expect(m.code.length, `${key}: code`).toBeGreaterThan(0)
      for (const g of m.code) expect(all.some((f) => aboutGlobMatch(g, f)), `${key}: ${g}`).toBe(true)
    }
  })
  it('MCP 도구 이름은 서버에 등록된 것이다', () => {
    const src = ['mcp.ts', 'mcpTasks.ts', 'mcpProblems.ts', 'mcpChats.ts'].map((f) => fs.readFileSync(path.join(root, 'apps/server/src', f), 'utf8')).join('\n')
    const tools = new Set([...src.matchAll(/registerTool\('([\w-]+)'/g)].map((m) => m[1]))
    for (const [key, m] of ABOUT_MD) for (const t of m.mcp) expect(tools.has(t), `${key}: ${t}`).toBe(true)
  })
})

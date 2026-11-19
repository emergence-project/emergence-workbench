import { describe, expect, it } from 'vitest'
import { ABOUT_PARTS_EN, ABOUT_PARTS_KO, COLOR_ROWS_EN, COLOR_ROWS_KO, SYMBOL_GROUPS_EN, SYMBOL_GROUPS_KO, type AboutPart, withPrFragments } from './aboutContent'

// 소개 글은 절 파일마다 두 언어(ko · en)가 함께 있다. 영어 쪽 data-ui는 같은 자리의 한국어 제목을 쓰므로(withUi) 모양이 같아야 한다
const shape = (parts: AboutPart[]) => parts.map((p) => ({
  id: p.id,
  open: p.open?.map((o) => o.to),
  left: p.left?.length ?? 0,
  sections: (p.sections ?? []).map((s) => ({ id: s.id, figure: !!s.figure, items: s.items.length, ask: !!s.ask })),
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
    const sections = Object.keys(import.meta.glob('./about/*/*.tsx')).map((f) => f.match(/([^/]+\/[^/]+)\.tsx$/)![1])
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

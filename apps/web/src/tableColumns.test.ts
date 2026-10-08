import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tableHiddenColumns } from './tableColumns'

// 실제 토큰으로 재서 폭을 바꿔도 화면 기준(양쪽 사이드바 열린 창)을 지키는지 검사한다.
const css = fs.readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const token = (name: string) => {
  const value = new RegExp(`${name}:\\s*(\\d+)px`).exec(css)
  if (!value) throw new Error(`폭 토큰 없음: ${name}`)
  return Number(value[1])
}
const widths: Record<string, number> = {
  title: token('--pl-col-title'), subject: token('--kl-col-subject'), projects: token('--kl-col-projects'),
  sources: token('--kl-col-num'), links: token('--kl-col-num'), issues: token('--kl-col-issues'), mtime: token('--kl-col-date'),
  aliases: token('--kl-col-aliases'), checked: token('--kl-col-checked'),
}
const layout = { order: Object.keys(widths), hidden: ['aliases', 'checked'], shown: [] as string[] }
const groups = [['projects'], ['links']]
const hiddenAt = (available: number, l = layout) => tableHiddenColumns(l, available, (id) => widths[id]!, groups)
const visibleWidth = (hidden: string[]) => layout.order.filter((id) => !hidden.includes(id)).reduce((sum, id) => sum + widths[id]!, 0)

describe('지식 표의 실제 칸 폭', () => {
  it('1440 창에서 띠·왼쪽 244·오른쪽 260·스크롤바를 빼도 기본 일곱 열이 들어간다', () => {
    const available = 1440 - 52 - 244 - 260 - 16
    expect(hiddenAt(available)).toEqual(layout.hidden)
    expect(visibleWidth(hiddenAt(available))).toBeLessThanOrEqual(available)
  })
  it('1200 창에서 프로젝트부터 숨기고, 더 좁으면 링크를 숨긴다', () => {
    const available = 1200 - 52 - 244 - 260
    expect(hiddenAt(available)).toEqual([...layout.hidden, 'projects'])
    expect(visibleWidth(hiddenAt(available))).toBeLessThanOrEqual(available)
    expect(hiddenAt(available - 16)).toEqual([...layout.hidden, 'projects', 'links'])
    expect(visibleWidth(hiddenAt(available - 16))).toBeLessThanOrEqual(available - 16)
  })
  it('경계 폭에 정확히 맞으면 열을 숨기지 않고, 넓어지면 자동으로 다시 보인다', () => {
    const minimum = visibleWidth(layout.hidden)
    expect(hiddenAt(minimum)).toEqual(layout.hidden)
    expect(hiddenAt(minimum - 1)).toContain('projects')
    expect(hiddenAt(minimum)).toEqual(layout.hidden)
  })
  it('명시적으로 켠 프로젝트·링크는 좁아져도 남아 가로 스크롤한다', () => {
    const pinned = { ...layout, shown: ['projects', 'links'] }
    const restored = JSON.parse(JSON.stringify(pinned))
    expect(hiddenAt(500, restored)).toEqual(layout.hidden)
    expect(visibleWidth(hiddenAt(500, restored))).toBeGreaterThan(500)
    expect(hiddenAt(640, { ...layout, shown: ['projects'] })).toEqual([...layout.hidden, 'links'])
  })
  it('사용자가 숨긴 열은 넓어져도 숨기며, 순서를 바꿔도 숨기는 우선순위는 같다', () => {
    expect(hiddenAt(2000, { ...layout, hidden: [...layout.hidden, 'projects'] })).toContain('projects')
    expect(hiddenAt(600, { ...layout, order: [...layout.order].reverse() })).toEqual(hiddenAt(600))
  })
})

describe('논문 표의 기존 규칙 보존', () => {
  it('폭·켜 둔 열·숨긴 열 조합에서 기존 저널/arXiv 동시 숨기기와 보이는 열이 같다', () => {
    const order = ['title', 'authors', 'year', 'venue', 'arxiv', 'projects', 'pdf', 'comments']
    const defaults = Object.fromEntries(order.map((id) => [id, token(`--pl-col-${id}`)]))
    for (const titleWidth of [200, 360]) for (let mask = 0; mask < 16; mask++) {
      const hidden = ['venue', 'arxiv', 'comments', 'projects'].filter((_, i) => mask & (1 << i))
      for (const shown of [[], ['venue'], ['arxiv'], ['venue', 'arxiv']]) {
        const widths: Record<string, number> = { ...defaults, title: titleWidth }
        const minimum = order.filter((id) => !hidden.includes(id)).reduce((sum, id) => sum + widths[id]!, 0)
        for (const available of [300, 800, minimum - 1, minimum, minimum + 1, 1600]) {
          const oldHidden = [...hidden, ...(available < minimum ? ['venue', 'arxiv'].filter((id) => !shown.includes(id)) : [])]
          const next = tableHiddenColumns({ order, hidden, shown }, available, (id) => widths[id]!, [['venue', 'arxiv']])
          expect(order.filter((id) => !next.includes(id))).toEqual(order.filter((id) => !oldHidden.includes(id)))
        }
      }
    }
  })
})

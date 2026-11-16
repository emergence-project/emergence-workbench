import { describe, expect, it } from 'vitest'
import { historyRows } from './AboutHistorySide'
import { fixText } from './AboutFix'
import type { AboutPart } from './aboutContent'

describe('소개 이력 사이드바 (11/16 시안 1절 안 A)', () => {
  const part: AboutPart = { id: 'p', title: 'P', sub: '', sections: [
    { title: '가', items: [], prs: [100, 200, 300] },
    { title: '나', items: [], prs: [200] },
  ] }
  const checks = {
    enabled: true, exists: true,
    sections: { 'p/1': { checked: 200, at: '2026-11-01' }, 'p/2': { checked: 200, at: '2026-11-01' } },
    prDates: { 100: '2026-10-01', 200: '2026-11-01', 300: '2026-11-10' }, prTitles: { 300: '셋째' },
  }
  it('업데이트마다 한 줄, 확인한 날도 한 줄, 최근이 위. 같은 날이면 확인 줄은 그때 확인한 PR 위', () => {
    const rows = historyRows(part, checks)
    expect(rows.map((r) => (r.kind === 'check' ? `확인 ${r.date}` : `#${r.n}`))).toEqual(['#300', '확인 2026-11-01', '#200', '#100'])
    expect(rows[0]).toMatchObject({ title: '셋째', secs: [0], after: true })
    expect(rows.find((r) => r.n === 200)).toMatchObject({ secs: [0, 1], after: false })
  })
  it('확인한 적이 없으면 「확인 뒤」를 달지 않는다', () => {
    const rows = historyRows(part, { ...checks, sections: {} })
    expect(rows.every((r) => !r.after)).toBe(true)
    expect(rows.some((r) => r.kind === 'check')).toBe(false)
  })
})

describe('소개 제자리 고치기 (11/16 시안 1-2절 안 C)', () => {
  it('바뀐 곳마다 자리 · 전 · 후, 그리고 그림에 대한 말 · 바라는 점', () => {
    const text = fixText([{ where: '표 「원고」 줄 · 「무엇」 칸', before: '공동 집필', after: '함께 쓰기' }, { where: '새 문단', before: '', after: '새 글' }], '', '줄 더하기')
    expect(text).toBe([
      '소개 글을 이렇게 고쳐 줘. (제자리 고치기, 변경사항 2)', '',
      '1. 표 「원고」 줄 · 「무엇」 칸', '   전: 공동 집필', '   후: 함께 쓰기', '',
      '2. 새 문단', '   전: (없음)', '   후: 새 글', '',
      '바라는 점: 줄 더하기',
    ].join('\n'))
  })
})

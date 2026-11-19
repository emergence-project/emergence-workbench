import { describe, expect, it } from 'vitest'
import { findSpans, historyRows } from './AboutHistorySide'
import { fixText } from './AboutFix'
import type { AboutPart } from './aboutContent'

describe('소개 이력 표 (11/20 시안 2절)', () => {
  const part: AboutPart = { id: 'p', title: 'P', sub: '', sections: [
    { title: '가', items: [], prs: [100, 200, 300], ask: '맞나요?' },
    { title: '나', items: [], prs: [200] },
  ] }
  const checks = {
    enabled: true, exists: true,
    sections: { 'p/1': { checked: 200, at: '2026-11-01' }, 'p/2': { checked: 100, at: '2026-10-01' } },
    prDates: { 100: '2026-10-01', 200: '2026-11-01', 300: '2026-11-10' }, prTitles: { 300: '셋째' },
  }
  it('(절, 업데이트)마다 한 줄, 최근이 위. 확인한 줄은 그 날, 확인 전 줄에는 todo, 물음은 그 절의 가장 최근 확인 전 줄에', () => {
    const rows = historyRows(part, checks)
    expect(rows.map((r) => `${r.sec}#${r.n}`)).toEqual(['0#300', '0#200', '1#200', '0#100'])
    expect(rows[0]).toMatchObject({ title: '셋째', todo: true, ask: '맞나요?' })
    expect(rows[1]).toMatchObject({ ok: '2026-11-01', todo: false })
    expect(rows[2]).toMatchObject({ todo: true })
    expect(rows[2]!.ok).toBeUndefined()
  })
  it('기록 파일이 없으면 확인 전을 세지 않는다', () => {
    expect(historyRows(part, { ...checks, exists: false, sections: {} }).every((r) => !r.todo && !r.ask)).toBe(true)
  })
  it('바꾼 문장 찾기: 빈칸을 빼고 맞춘다', () => {
    const flat = '확인은절하나씩합니다.줄마다맞아요를누릅니다.'
    expect(findSpans(flat, ['줄마다 맞아요 를 누릅니다.', '없는 문장입니다.'])).toEqual([[11, 23]])
  })
})

describe('소개 고치기 탭 (11/20 시안 3절 안 C)', () => {
  it('담은 곳마다 자리 · 전 · 후, 그리고 바라는 점', () => {
    const text = fixText([{ where: '정의 › 그림 › 원고', before: '공동 집필', after: '함께 쓰기' }, { where: '정의 › 문단 「새」', before: '', after: '새 글' }], '줄 더하기')
    expect(text).toBe([
      '소개 글을 이렇게 고쳐 줘. (고치기 탭, 고친 곳 2)', '',
      '1. 정의 › 그림 › 원고', '   전: 공동 집필', '   후: 함께 쓰기', '',
      '2. 정의 › 문단 「새」', '   전: (없음)', '   후: 새 글', '',
      '바라는 점: 줄 더하기',
    ].join('\n'))
  })
})

import { describe, expect, it } from 'vitest'
import { anchoredById, anchoredUnit, appendUnit, memoHighlights, memoUnits, newAnchorId, replaceUnit, unitSource } from './conceptMemo'

describe('concept memo units', () => {
  it('makes one unit per to-do and per memo item or paragraph', () => {
    const memo = [
      '- [ ] 기본 성질 1–3의 증명 검토하기 (2026-10-04 에이전트가 씀)',
      '  출처의 Lemma 2와 대조',
      '- [x] 정의 정리하기',
      '',
      '- 열린 질문: 경계가 있을 때도 성립하나?',
      '  - 반례 후보: 원판',
      '- 작업 지침: 그림은 공용 자산으로',
      '',
      '문단 하나.',
      '같은 문단.',
      '',
      '## Study 원문',
      '',
      '첫 문단.',
      '',
      '- 절 안의 목록',
    ].join('\n')
    expect(memoUnits(memo)).toEqual([
      { kind: 'task', line: 0, done: false, text: '기본 성질 1–3의 증명 검토하기 (2026-10-04 에이전트가 씀)', more: '출처의 Lemma 2와 대조', from: 0, to: 2 },
      { kind: 'task', line: 2, done: true, text: '정의 정리하기', more: '', from: 2, to: 3 },
      { kind: 'note', text: '열린 질문: 경계가 있을 때도 성립하나?\n- 반례 후보: 원판', from: 4, to: 6 },
      { kind: 'note', text: '작업 지침: 그림은 공용 자산으로', from: 6, to: 7 },
      { kind: 'note', text: '문단 하나.\n같은 문단.', from: 8, to: 10 },
      { kind: 'note', text: '## Study 원문\n\n첫 문단.\n\n- 절 안의 목록', from: 11, to: 16 },
    ])
  })

  it('keeps an empty memo empty', () => {
    expect(memoUnits('')).toEqual([])
    expect(memoUnits('\n\n')).toEqual([])
  })

  it('edits and deletes one unit, leaving the other lines as they were (10/8 11:47)', () => {
    const memo = '- [ ] 하나\n  자세히\n\n- 메모 둘\n\n문단 셋.\n'
    const [task, note, para] = memoUnits(memo)
    expect(unitSource(memo, task!)).toBe('- [ ] 하나\n  자세히')
    expect(replaceUnit(memo, note!, '- 메모 둘 고침')).toBe('- [ ] 하나\n  자세히\n\n- 메모 둘 고침\n\n문단 셋.\n')
    expect(replaceUnit(memo, note!, null)).toBe('- [ ] 하나\n  자세히\n\n문단 셋.\n')
    expect(replaceUnit(memo, task!, '  ')).toBe('- 메모 둘\n\n문단 셋.\n')
    expect(replaceUnit(memo, para!, null)).toBe('- [ ] 하나\n  자세히\n\n- 메모 둘\n')
  })

  it('adds a to-do at the end and a memo before the first heading', () => {
    expect(appendUnit('', 'task', '새 일')).toBe('- [ ] 새 일\n')
    expect(appendUnit('- 메모\n', 'task', '- [ ] 새 일')).toBe('- 메모\n\n- [ ] 새 일\n')
    const memo = '- 메모\n\n## Study 원문\n\n본문\n'
    expect(appendUnit(memo, 'note', '새 메모')).toBe('- 메모\n\n새 메모\n\n## Study 원문\n\n본문\n')
    expect(memoUnits(appendUnit(memo, 'note', '새 메모')).map((u) => u.kind === 'note' && u.text)).toEqual(['메모', '새 메모', '## Study 원문\n\n본문'])
  })
})

describe('anchored memos', () => {
  const anchor = { id: 'm-20261008-0521', color: 'green' as const, quote: 'the <bound>\nholds', line: 3, prefix: 'so ', suffix: ' for all' }
  it('round-trips a selection memo and keeps list lines in it', () => {
    const unit = anchoredUnit(anchor, 'Check this.\n\n- for disks too')
    expect(unit.split('\n')[0]).toBe('> "the <bound> holds"')
    expect(unit).not.toContain('<bound>"')
    const memo = appendUnit('- [ ] task\n\nplain memo\n', 'note', unit)
    const units = memoUnits(memo)
    expect(units.map((u) => u.kind)).toEqual(['task', 'note', 'note'])
    expect(units[2]).toMatchObject({ kind: 'note', text: 'Check this.\n- for disks too', anchor })
    expect(memoHighlights(memo)).toEqual([{ id: anchor.id, rects: [], color: 'green', quote: anchor.quote, line: 3, prefix: 'so ', suffix: ' for all', body: 'Check this.\n- for disks too' }])
    expect(anchoredById(memo, anchor.id)?.from).toBe(units[2]!.from)
  })
  it('keeps a highlight without text and replaces or removes only that unit', () => {
    const memo = appendUnit('plain memo\n', 'note', anchoredUnit(anchor, ''))
    const u = anchoredById(memo, anchor.id)!
    expect(u.text).toBe('')
    expect(memoHighlights(memo)).toHaveLength(1)
    const recolored = replaceUnit(memo, u, anchoredUnit({ ...anchor, color: 'pink' }, 'now with text'))
    expect(memoUnits(recolored)[1]).toMatchObject({ text: 'now with text', anchor: { color: 'pink' } })
    expect(replaceUnit(memo, u, null).trim()).toBe('plain memo')
  })
  it('names new ids by time and avoids clashes', () => {
    const now = new Date(2026, 9, 8, 5, 21)
    const memo = anchoredUnit(anchor, '')
    expect(newAnchorId('', now)).toBe('m-20261008-0521')
    expect(newAnchorId(memo, now)).toBe('m-20261008-0521-2')
  })
  it('reads a broken meta line as a plain memo', () => {
    const u = memoUnits('> "x"\n<!-- rw: {oops} -->\nbody')[0]
    expect(u?.kind).toBe('note')
    expect(u?.kind === 'note' && u.anchor).toBeFalsy()
  })
})

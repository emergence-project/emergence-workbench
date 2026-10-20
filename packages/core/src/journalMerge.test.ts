import { describe, expect, it } from 'vitest'
import { mergeJournalText } from './journal.js'

const memo = '## 09:40 · 메모 · 연구\n10/2 요약\n- NBCP 노트'
const todo = '## 09:47 · 할 일 · 연구\n- [ ] 일괄 검토'
const doc = (...entries: string[]) => ['# 2026-10-03', ...entries].join('\n\n') + '\n'

describe('일지 항목 단위 합치기', () => {
  it('이웃한 두 항목을 양쪽에서 하나씩 지우면 둘 다 지운다 (LSWT 10/3)', () => {
    expect(mergeJournalText(doc(memo, todo), doc(memo), doc(todo))).toBe('# 2026-10-03\n')
  })
  it('양쪽이 더한 항목을 모두 두고, 저쪽 것은 저쪽 자리에', () => {
    const a = '## 10:00 · 메모 · 연구\nA'
    const z = '## 11:00 · 메모 · 연구\nZ'
    expect(mergeJournalText(doc(memo), doc(memo, z), doc(a, memo))).toBe(doc(a, memo, z))
  })
  it('같은 항목을 양쪽이 서로 다르게 고치면 사람이 합친다', () => {
    expect(mergeJournalText(doc(memo), doc(memo + '\n덧붙임 1'), doc(memo + '\n덧붙임 2'))).toBeNull()
  })
  it('한쪽만 고친 항목은 고친 쪽, 다른 쪽이 지운 것과 겹치지 않으면 그대로', () => {
    expect(mergeJournalText(doc(memo, todo), doc(memo + '\n더', todo), doc(memo))).toBe(doc(memo + '\n더'))
  })
})

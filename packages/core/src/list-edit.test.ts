import { describe, expect, it } from 'vitest'
import { listKey } from './list-edit.js'

/** "|"를 커서 자리로 쓴다 */
const at = (s: string) => ({ value: s.replace('|', ''), pos: s.indexOf('|') })
const show = (r: { value: string; start: number } | null) => (r ? r.value.slice(0, r.start) + '|' + r.value.slice(r.start) : null)
const enter = (s: string) => { const a = at(s); return show(listKey(a.value, a.pos, a.pos, 'Enter')) }
const tab = (s: string, shift = false) => { const a = at(s); return show(listKey(a.value, a.pos, a.pos, 'Tab', shift)) }

describe('입력칸 목록 쓰기', () => {
  it('Enter는 같은 기호로 다음 항목을 잇고, 번호는 하나 늘린다', () => {
    expect(enter('- 첫째|')).toBe('- 첫째\n- |')
    expect(enter('* a|')).toBe('* a\n* |')
    expect(enter('  - 안쪽|')).toBe('  - 안쪽\n  - |')
    expect(enter('1. 하나|')).toBe('1. 하나\n2. |')
    expect(enter('- 가운데|에서')).toBe('- 가운데\n- |에서')
  })
  it('빈 항목에서 Enter면 한 단계 내어쓰고, 맨 바깥이면 목록을 끝낸다', () => {
    expect(enter('- a\n  - |')).toBe('- a\n- |')
    expect(enter('- a\n- |')).toBe('- a\n|')
  })
  it('목록이 아닌 줄은 건드리지 않는다', () => {
    expect(enter('그냥 글|')).toBeNull()
    expect(tab('그냥 글|')).toBeNull()
    expect(enter('-붙은 글|')).toBeNull()
  })
  it('Tab은 두 칸 들여쓰고 Shift+Tab은 내어쓴다', () => {
    expect(tab('- a\n- b|')).toBe('- a\n  - b|')
    expect(tab('- a\n  - b|', true)).toBe('- a\n- b|')
    expect(tab('- b|', true)).toBe('- b|')
  })
  it('여러 줄을 고르고 Tab하면 고른 목록 줄을 함께 들여쓴다', () => {
    const v = '- a\n- b\n글'
    const r = listKey(v, 0, v.length, 'Tab')!
    expect(r.value).toBe('  - a\n  - b\n글')
  })
})

import { describe, expect, it } from 'vitest'
import { checkState, okDate, prsSince } from './aboutChecks'

describe('소개 절 확인 상태 (11/11 안 C′)', () => {
  const sec = { prs: [81, 229, 402] }
  it('확인한 PR 뒤에 그 절을 고친 PR이 있으면 확인 전', () => {
    expect(checkState(sec, { checked: 402 }, true)).toBe('checked')
    expect(checkState(sec, { checked: 229 }, true)).toBe('unchecked')
    expect(prsSince(sec, { checked: 229 })).toEqual([402])
  })
  it('기록이 없는 절: PR이 있으면 확인 전, 없으면 확인함. 파일이 없으면 세지 않는다', () => {
    expect(checkState(sec, undefined, true)).toBe('unchecked')
    expect(checkState({}, undefined, true)).toBe('checked')
    expect(checkState(sec, undefined, false)).toBe('checked')
  })
  it('고쳐 보낸 뒤 새 PR이 오기 전까지 반영 대기, 오면 다시 확인 전', () => {
    expect(checkState(sec, { checked: 402, sentPr: 402 }, true)).toBe('pending')
    expect(checkState({ prs: [81, 229, 402, 440] }, { checked: 402, sentPr: 402 }, true)).toBe('unchecked')
  })
  it('업데이트 줄마다 확인: 남은 줄이 없어야 확인함, 날짜는 줄의 것 또는 절 확인의 것 (11/20 시안 2절)', () => {
    const rec = { checked: 81, at: '2026-11-01', ok: { 402: '2026-11-20' } }
    expect(prsSince(sec, rec)).toEqual([229])
    expect(checkState(sec, rec, true)).toBe('unchecked')
    expect(checkState(sec, { ...rec, ok: { 229: '2026-11-20', 402: '2026-11-20' } }, true)).toBe('checked')
    expect([okDate(rec, 81), okDate(rec, 229), okDate(rec, 402)]).toEqual(['2026-11-01', undefined, '2026-11-20'])
  })
})

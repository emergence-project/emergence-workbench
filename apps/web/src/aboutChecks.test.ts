import { describe, expect, it } from 'vitest'
import { checkState, prsSince } from './aboutChecks'

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
})

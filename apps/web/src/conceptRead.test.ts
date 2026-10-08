import { describe, expect, it } from 'vitest'
import { conceptReadResult } from './conceptRead'

describe('개념노트를 다시 읽은 결과', () => {
  it('보기만 할 때는 새 본문을 그대로 쓰고, 읽지 못하면 오류를 보인다', () => {
    expect(conceptReadResult(null, false, { hash: 'b' })).toEqual({})
    expect(conceptReadResult(null, false, new Error('없음'))).toEqual({ error: '없음' })
  })
  it('고치는 중 바깥에서 바뀌거나 지워지면 편집기를 내리지 않고 알린다', () => {
    expect(conceptReadResult({ hash: 'a' }, false, { hash: 'b' }).notice).toMatch(/바깥에서 이 노트가 바뀌었습니다/)
    const gone = conceptReadResult({ hash: 'a' }, false, new Error('없음'))
    expect(gone.error).toBeUndefined()
    expect(gone.notice).toMatch(/다시 읽지 못했습니다/)
  })
  it('같은 내용이거나 이 화면이 저장하는 중이면 알리지 않는다', () => {
    expect(conceptReadResult({ hash: 'a' }, false, { hash: 'a' })).toEqual({})
    expect(conceptReadResult({ hash: 'a' }, true, { hash: 'b' })).toEqual({})
  })
})

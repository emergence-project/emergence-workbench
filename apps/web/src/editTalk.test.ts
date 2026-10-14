import { describe, expect, it } from 'vitest'
import type { CommentEntry } from './api'
import { talksOf, talkTurn, talkWhen } from './editTalk'

const c = (over: Partial<CommentEntry>): CommentEntry => ({ id: 'c-20261014-1337', kind: '질문', where: '전체', rects: [], body: 'why', state: '대기', answers: [], ...over })

describe('바뀐 곳에서 묻기', () => {
  it('지금 글이나 고치기 전 글로 같은 바뀐 곳을 찾고, 다른 기록은 뺀다', () => {
    const recs = [c({ edit: '질문', quote: 'Alpha, sharper.', editBase: 'Alpha.' }), c({ edit: '수정', quote: 'Beta!', editBase: 'Beta.' }), c({ quote: 'Alpha, sharper.' })]
    expect(talksOf({ base: 'Alpha.', current: 'Alpha, sharper.' }, recs)).toEqual([recs[0]])
    // 다시 고쳐 지금 글이 바뀌어도 고치기 전 글로 찾는다
    expect(talksOf({ base: 'Beta.', current: 'Beta, done.' }, recs)).toEqual([recs[1]])
    expect(talksOf({ base: '', current: 'New.' }, recs)).toEqual([])
  })
  it('마지막 것의 상태로 차례를 정하고 시각을 짧게 쓴다', () => {
    expect(talkTurn([])).toBeNull()
    expect(talkTurn([c({ state: '답함' }), c({ state: '대기' })])).toBe('agent')
    expect(talkTurn([c({ state: '답함' })])).toBe('user')
    expect(talkWhen('c-20261014-1337-2')).toBe('10/14 13:37')
    expect(talkWhen('2026-10-14 13:40')).toBe('10/14 13:40')
  })
})

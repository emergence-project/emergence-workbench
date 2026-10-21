import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_DRAFTS, readFeedbackDrafts, removeFeedbackDraft, saveFeedbackDraft } from './feedbackDraft'

const store = new Map<string, string>()
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } })
})
afterEach(() => store.clear())

const draft = (id: string, at: string) => ({ id, text: `글 ${id}`, kind: '질문' as const, path: '사이드바', snippet: '목차', route: '#/r/x/records', at })

describe('적던 피드백 (10/21, 여러 개)', () => {
  it('여러 개를 새 것부터 두고, 같은 id는 바꾸며, 하나씩 지운다', () => {
    saveFeedbackDraft(draft('a', '2026-10-21T00:58:00.000Z'))
    saveFeedbackDraft(draft('b', '2026-10-21T01:00:00.000Z'))
    expect(readFeedbackDrafts().map((d) => d.id)).toEqual(['b', 'a'])
    saveFeedbackDraft({ ...draft('a', '2026-10-21T01:05:00.000Z'), text: '고친 글' })
    expect(readFeedbackDrafts().map((d) => [d.id, d.text])).toEqual([['a', '고친 글'], ['b', '글 b']])
    expect(removeFeedbackDraft('a').map((d) => d.id)).toEqual(['b'])
    expect(readFeedbackDrafts().map((d) => d.id)).toEqual(['b'])
  })
  it(`많아야 ${MAX_DRAFTS}개`, () => {
    for (let i = 0; i < MAX_DRAFTS + 3; i++) saveFeedbackDraft(draft(`d${i}`, `2026-10-21T01:${String(i).padStart(2, '0')}:00.000Z`))
    expect(readFeedbackDrafts()).toHaveLength(MAX_DRAFTS)
    expect(readFeedbackDrafts()[0]?.id).toBe(`d${MAX_DRAFTS + 2}`)
  })
  it('하나만 두던 때의 적던 글도 읽어 목록으로 옮긴다', () => {
    store.set('rw-feedback-draft', JSON.stringify({ text: '옛 글', kind: '기타', path: '', at: '2026-10-20T09:00:00.000Z' }))
    expect(readFeedbackDrafts()).toMatchObject([{ text: '옛 글', kind: null, route: '#/' }])
    saveFeedbackDraft(draft('n', '2026-10-21T01:00:00.000Z'))
    expect(store.has('rw-feedback-draft')).toBe(false)
    expect(readFeedbackDrafts().map((d) => d.text)).toEqual(['글 n', '옛 글'])
  })
  it('빈 글 · 깨진 값은 없는 것으로 읽고, 저장소를 쓸 수 없어도 오류를 내지 않는다', () => {
    store.set('rw-feedback-drafts', '{')
    expect(readFeedbackDrafts()).toEqual([])
    store.set('rw-feedback-drafts', JSON.stringify([{ text: '  ', path: '' }, 3]))
    expect(readFeedbackDrafts()).toEqual([])
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
    expect(readFeedbackDrafts()).toEqual([])
    expect(() => saveFeedbackDraft(draft('x', ''))).not.toThrow()
  })
})

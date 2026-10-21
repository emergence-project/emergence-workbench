import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearFeedbackDraft, readFeedbackDraft, writeFeedbackDraft } from './feedbackDraft'

const store = new Map<string, string>()
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } })
})
afterEach(() => store.clear())

describe('적던 피드백 (10/21)', () => {
  it('쓰고 읽고 지운다', () => {
    const d = { text: '글', kind: '질문' as const, path: '사이드바', snippet: '목차', route: '#/r/x/records', at: '2026-10-21T00:58:00.000Z' }
    writeFeedbackDraft(d)
    expect(readFeedbackDraft()).toEqual(d)
    clearFeedbackDraft()
    expect(readFeedbackDraft()).toBeNull()
  })
  it('빈 글 · 깨진 값은 없는 것으로 읽고, 모르는 유형은 고르지 않은 것으로', () => {
    store.set('rw-feedback-draft', '{')
    expect(readFeedbackDraft()).toBeNull()
    store.set('rw-feedback-draft', JSON.stringify({ text: '  ', path: '' }))
    expect(readFeedbackDraft()).toBeNull()
    store.set('rw-feedback-draft', JSON.stringify({ text: '글', path: '', kind: '기타' }))
    expect(readFeedbackDraft()).toMatchObject({ text: '글', kind: null, route: '#/' })
  })
  it('저장소를 쓸 수 없어도 오류를 내지 않는다', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
    expect(readFeedbackDraft()).toBeNull()
    expect(() => writeFeedbackDraft({ text: '글', kind: null, path: '', snippet: '', route: '#/', at: '' })).not.toThrow()
  })
})

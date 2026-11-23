import { describe, expect, it } from 'vitest'
import type { ChatItem } from './api/agentChats'
import { feedbackChatPart } from './feedbackChatPart'

const A = '2026-10-04 10:15 사이드바 › 목차'
const B = '2026-10-04 10:20 상단바 › 검색'
const C = '2026-10-04 10:30 노트 › 표'

const user = (text: string) => ({ kind: 'user', text }) as ChatItem
const text = (t: string) => ({ kind: 'text', text: t }) as ChatItem
const step = (tool: string, summary: string) => ({ kind: 'step', tool, summary }) as ChatItem
const answer = (key: string) => step('feedback_answer', `${key} · 반영`)

describe('feedbackChatPart', () => {
  it('drops the hand-off prompt and keeps everything when not a bundle', () => {
    const items = [user('맡김 안내'), text('보겠습니다'), step('Read', 'a.ts')]
    expect(feedbackChatPart(items, A)).toEqual({ items: items.slice(1), whole: true })
  })

  it('splits a bundle at feedback_answer records', () => {
    const items = [user('맡김'), text('A 고침'), step('Edit', 'x'), answer(A), text('B 고침'), answer(B), text('C 보는 중')]
    const bundle = [A, B, C]
    expect(feedbackChatPart(items, A, bundle).items.map((i) => (i.kind === 'text' ? i.text : i.kind))).toEqual(['A 고침', 'step', 'step'])
    expect(feedbackChatPart(items, B, bundle).items.map((i) => (i.kind === 'text' ? i.text : i.kind))).toEqual(['B 고침', 'step'])
    // 아직 기록 전인 C는 끝의 임자 없는 마디를 갖는다
    expect(feedbackChatPart(items, C, bundle).items.map((i) => (i.kind === 'text' ? i.text : i.kind))).toEqual(['C 보는 중'])
  })

  it('consecutive records share the chunk', () => {
    const items = [user('맡김'), text('둘 다 고침'), answer(A), answer(B), text('끝')]
    expect(feedbackChatPart(items, A, [A, B]).items).toEqual(items.slice(1, 4))
    expect(feedbackChatPart(items, B, [A, B]).items).toEqual(items.slice(1, 4))
  })

  it('an answered item keeps an ownerless chunk only when it mentions the key', () => {
    const items = [user('맡김'), text('A 고침'), answer(A), text(`${A} 다시 확인`), text('마무리')]
    expect(feedbackChatPart(items, A, [A, B]).items.map((i) => (i.kind === 'text' ? i.text : i.kind))).toEqual(['A 고침', 'step', `${A} 다시 확인`, '마무리'])
  })

  it('shows the whole chat when no record carries a key (older chats)', () => {
    const items = [user('맡김'), text('고침'), step('feedback_answer', '반영')]
    expect(feedbackChatPart(items, A, [A, B])).toEqual({ items: items.slice(1), whole: true })
  })
})

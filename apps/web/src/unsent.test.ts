import { describe, expect, it } from 'vitest'
import { anyUnsent, draftMap, draftSource } from './unsent'
import { recordDrafts } from './recordDrafts'

// 화면의 입력란(적은 입력란을 기억하는 쪽)은 브라우저 검사가 본다: scripts/shots/input-drafts.mjs의 screen-update-waits-for-typed-draft
describe('unsent text (the auto reload waits for it)', () => {
  it('counts a draft kept for a key until it is sent or cleared', () => {
    const drafts = draftMap<string>()
    expect(anyUnsent()).toBe(false)
    drafts.set('chat-1', '적던 글')
    expect(anyUnsent()).toBe(true)
    drafts.delete('chat-1')
    expect(anyUnsent()).toBe(false)
  })

  it('asks every registered source', () => {
    let has = false
    draftSource(() => has)
    expect(anyUnsent()).toBe(false)
    has = true
    expect(anyUnsent()).toBe(true)
    has = false
  })

  it('counts a record draft with text, not an empty one or one with only an attachment', () => {
    recordDrafts.write('note:a', { text: '', kind: '메모', attachment: { quote: '인용' }, color: 'yellow' })
    expect(anyUnsent()).toBe(false)
    recordDrafts.write('note:a', { text: '기록 초안', kind: '메모', attachment: {}, color: 'yellow' })
    expect(anyUnsent()).toBe(true)
    recordDrafts.write('note:a', { text: '  ', kind: '메모', attachment: {}, color: 'yellow' })
    expect(anyUnsent()).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { createRecordDraftStore, attachRecordDraft } from './recordDrafts'

describe('record composer across tab changes', () => {
  it('keeps an attached quote when reopening and replaces it only with a new selection', () => {
    const draft = { text: 'draft body', kind: '메모' as const, color: 'blue' as const, attachment: { quote: 'first', line: 4 } }
    expect(attachRecordDraft(draft, {}, 'yellow')).toBe(draft)
    expect(attachRecordDraft(draft, { quote: 'second', line: 8 }, 'pink')).toEqual({ ...draft, attachment: { quote: 'second', line: 8 }, color: 'pink' })
  })
  it('blocks a duplicate submit after remount and keeps another target independent', () => {
    const store = createRecordDraftStore()
    store.write('r|note-a', { text: 'one', kind: '자동', color: 'blue', attachment: { quote: 'selected', line: 4 } })
    const save = store.begin('r|note-a', 'yellow')!
    expect(store.read('r|note-a', 'yellow').pending).toBe(save.id)
    expect(store.begin('r|note-a', 'yellow')).toBeNull()
    store.write('r|note-b', { text: 'other', kind: '메모', color: 'pink', attachment: {} })
    store.finish('r|note-a', save, 'green', null)
    expect(store.read('r|note-a', 'yellow').draft.text).toBe('')
    expect(store.read('r|note-b', 'yellow').draft.text).toBe('other')
  })
  it('preserves text and quote after failure and ignores stale completions', () => {
    const store = createRecordDraftStore()
    const draft = { text: 'keep my text', kind: '질문' as const, color: 'blue' as const, attachment: { quote: 'original quote', line: 12 } }
    store.write('a', draft)
    const first = store.begin('a', 'yellow')!
    store.finish('a', first, 'yellow', 'offline')
    expect(store.read('a', 'yellow')).toMatchObject({ draft, error: 'offline', pending: null })
    const second = store.begin('a', 'yellow')!
    store.finish('a', first, 'yellow', null)
    expect(store.read('a', 'yellow')).toMatchObject({ draft, pending: second.id })
    store.finish('a', second, 'yellow', null)
    store.write('a', { ...draft, text: 'next note' })
    store.finish('a', second, 'yellow', null)
    expect(store.read('a', 'yellow').draft.text).toBe('next note')
  })
})

import { describe, expect, it } from 'vitest'
import type { TaskAsk } from './api'
import { answerNoteSaveTicket, answerQuestionKeys, beginAnswerNoteSave, editAnswerNote, finishAnswerNoteSave, mergeAnswerNotes, unassignedAnswerNotes, type AnswerNoteDrafts } from './taskAnswerNotes'

const asks: [TaskAsk, TaskAsk] = [{ q: '첫째 질문', options: ['예', '아니오'] }, { q: '둘째 질문', options: ['결론', '부록'] }]
const keys = answerQuestionKeys(asks)
const one = keys[0]!
const two = keys[1]!
const answer = (n: number, note?: string) => ({ n, answer: '예', note, at: '2026-10-07 12:00' })
describe('question note drafts while answers reload', () => {
  it('keeps a not-yet-answered note when another answer saves', () => {
    const drafts: AnswerNoteDrafts = { [two]: { text: '둘째 초안', saved: '' } }
    expect(mergeAnswerNotes(drafts, [answer(1, '첫째 답')], asks)[two]).toEqual(drafts[two])
  })
  it('keeps input made after the saved note was sent', () => {
    expect(mergeAnswerNotes({ [one]: { text: '더 고친 말', saved: '처음 말' } }, [answer(1, '보낸 말')], asks)[one]).toEqual({ text: '더 고친 말', saved: '보낸 말' })
  })
  it('keeps an edit that reverts to the old saved note while a save is waiting', () => {
    const drafts = { [one]: { text: '처음 말', saved: '처음 말', revision: 2, pending: { id: 1, key: one, revision: 1, text: '보낸 말' } } }
    expect(mergeAnswerNotes(drafts, [answer(1, '보낸 말')], asks)[one]!.text).toBe('처음 말')
  })
  it('keeps an empty revert while the first note save is waiting', () => {
    const drafts = { [one]: { text: '', saved: '', revision: 2, pending: { id: 1, key: one, revision: 1, text: '보낸 말' } } }
    expect(mergeAnswerNotes(drafts, [answer(1, '보낸 말')], asks)[one]!.text).toBe('')
  })
  it('refreshes untouched notes and accepts the exact saved draft', () => {
    const drafts = mergeAnswerNotes({ [one]: { text: '처음 말', saved: '처음 말' }, [two]: { text: '보낸 말', saved: '' } }, [answer(1, '바깥 답'), answer(2, '보낸 말')], asks)
    expect(drafts).toEqual({ [one]: { text: '바깥 답', saved: '바깥 답' }, [two]: { text: '보낸 말', saved: '보낸 말' } })
    expect(mergeAnswerNotes(drafts, [answer(1, '다음 답'), answer(2, '다음 말')], asks)[two]!.text).toBe('다음 말')
  })
  it('preserves dirty text across a failed save reload', () => {
    expect(mergeAnswerNotes({ [one]: { text: '미저장 말', saved: '저장한 말' } }, [answer(1, '저장한 말')], asks)[one]!.text).toBe('미저장 말')
  })
  it('clears untouched notes when their saved answer is removed', () => {
    expect(mergeAnswerNotes({ [one]: { text: '지난 답', saved: '지난 답' } }, [], asks)[one]).toEqual({ text: '', saved: '' })
  })
  it('keeps a draft with the same question if the file reorders or inserts questions', () => {
    const changed = [{ q: '새 질문', options: [] }, asks[1], asks[0]]
    const keys = answerQuestionKeys(changed)
    expect(keys[1]).toBe(two)
    expect(mergeAnswerNotes({ [one]: { text: '첫째 초안', saved: '' } }, [], changed)[keys[2]!]!.text).toBe('첫째 초안')
    expect(mergeAnswerNotes({ [one]: { text: '첫째 초안', saved: '' } }, [], changed)[keys[0]!]!.text).toBe('')
  })
  it('does not attach the first duplicate draft to a remaining duplicate after one is removed', () => {
    const duplicates = [asks[0], asks[0]]
    const duplicateKeys = answerQuestionKeys(duplicates)
    const drafts: AnswerNoteDrafts = {
      [duplicateKeys[0]!]: { text: '앞 질문 초안', saved: '' },
      [duplicateKeys[1]!]: { text: '뒤 질문 초안', saved: '' },
    }
    const remaining = answerQuestionKeys([asks[0]])[0]!
    const refreshed = mergeAnswerNotes(drafts, [], [asks[0]])
    expect(refreshed[remaining]!.text).toBe('')
    expect(Object.values(refreshed).map((d) => d.text)).toEqual(expect.arrayContaining(['앞 질문 초안', '뒤 질문 초안']))
  })
  it('archives both changed duplicate drafts with their question and never reattaches them automatically', () => {
    const duplicates = [asks[0], asks[0]]
    const keys = answerQuestionKeys(duplicates)
    const drafts: AnswerNoteDrafts = { [keys[0]!]: { text: '앞 초안', saved: '' }, [keys[1]!]: { text: '뒤 초안', saved: '' } }
    const changed = [{ q: '새 질문', options: [] }, ...duplicates]
    const refreshed = mergeAnswerNotes(drafts, [], changed)
    for (const key of answerQuestionKeys(changed)) expect(refreshed[key]!.text).toBe('')
    expect(unassignedAnswerNotes(refreshed).map(({ question, text }) => ({ question, text }))).toEqual([
      { question: asks[0].q, text: '앞 초안' }, { question: asks[0].q, text: '뒤 초안' },
    ])
    const restored = mergeAnswerNotes(refreshed, [], duplicates)
    for (const key of keys) expect(restored[key]!.text).toBe('')
    expect(unassignedAnswerNotes(restored).map((draft) => draft.text)).toEqual(['앞 초안', '뒤 초안'])
  })
  it('drops removed clean notes while retaining unassigned dirty notes', () => {
    const refreshed = mergeAnswerNotes({ [one]: { text: '저장된 답', saved: '저장된 답' }, [two]: { text: '남길 초안', saved: '' } }, [], [])
    expect(Object.keys(refreshed)).toHaveLength(1)
    expect(unassignedAnswerNotes(refreshed)[0]).toMatchObject({ question: asks[1].q, text: '남길 초안' })
  })
  it('keeps repeated identical prompts separate', () => {
    expect(new Set(answerQuestionKeys([asks[0], asks[0]])).size).toBe(2)
  })
})


describe('question note save tickets', () => {
  const start = (text = '처음 말') => ({ [one]: { text, saved: text } })
  it('keeps a reverted edit after a successful save and refresh', () => {
    let drafts: AnswerNoteDrafts = editAnswerNote(start(), one, '보낸 말')
    const ticket = answerNoteSaveTicket(drafts, one, 1)
    drafts = beginAnswerNoteSave(drafts, ticket)
    drafts = editAnswerNote(drafts, one, '처음 말')
    drafts = finishAnswerNoteSave(drafts, ticket, '보낸 말')
    expect(drafts[one]).toMatchObject({ text: '처음 말', saved: '보낸 말', revision: 2 })
    expect(drafts[one]!.pending).toBeUndefined()
    expect(mergeAnswerNotes(drafts, [answer(1, '보낸 말')], asks)[one]!.text).toBe('처음 말')
  })
  it('keeps a reverted draft when an older save succeeds and the latest request conflicts', () => {
    let drafts = editAnswerNote(start(), one, '보낸 말')
    const first = answerNoteSaveTicket(drafts, one, 1)
    drafts = beginAnswerNoteSave(drafts, first)
    drafts = editAnswerNote(drafts, one, '처음 말')
    const second = answerNoteSaveTicket(drafts, one, 2)
    drafts = beginAnswerNoteSave(drafts, second)
    drafts = finishAnswerNoteSave(drafts, first, '보낸 말')
    drafts = mergeAnswerNotes(drafts, [answer(1, '보낸 말')], asks)
    expect(drafts[one]!.text).toBe('처음 말')
    drafts = finishAnswerNoteSave(drafts, second)
    expect(mergeAnswerNotes(drafts, [answer(1, '보낸 말')], asks)[one]!.text).toBe('처음 말')
  })
  it('keeps a failed latest draft when its reload finishes before the older save', () => {
    let drafts = editAnswerNote(start(), one, '보낸 말')
    const first = answerNoteSaveTicket(drafts, one, 1)
    drafts = beginAnswerNoteSave(drafts, first)
    drafts = editAnswerNote(drafts, one, '처음 말')
    const second = answerNoteSaveTicket(drafts, one, 2)
    drafts = beginAnswerNoteSave(drafts, second)
    drafts = finishAnswerNoteSave(drafts, second)
    drafts = mergeAnswerNotes(drafts, [answer(1, '처음 말')], asks)
    drafts = finishAnswerNoteSave(drafts, first, '보낸 말')
    expect(mergeAnswerNotes(drafts, [answer(1, '보낸 말')], asks)[one]!.text).toBe('처음 말')
  })
  it('accepts the canonical server note when input did not change', () => {
    let drafts = editAnswerNote(start(), one, '  여러   말  ')
    const ticket = answerNoteSaveTicket(drafts, one, 1)
    drafts = beginAnswerNoteSave(drafts, ticket)
    expect(finishAnswerNoteSave(drafts, ticket, '여러 말')[one]).toMatchObject({ text: '여러 말', saved: '여러 말' })
  })
  it('keeps an edit made while saving even if it becomes the sent text again', () => {
    let drafts = editAnswerNote(start(), one, '  보낸 말  ')
    const ticket = answerNoteSaveTicket(drafts, one, 1)
    drafts = beginAnswerNoteSave(drafts, ticket)
    drafts = editAnswerNote(drafts, one, '다른 말')
    drafts = editAnswerNote(drafts, one, '  보낸 말  ')
    expect(finishAnswerNoteSave(drafts, ticket, '보낸 말')[one]!.text).toBe('  보낸 말  ')
  })
  it('ignores completion of an older request for the same question', () => {
    let drafts = editAnswerNote(start(), one, '첫 요청')
    const first = answerNoteSaveTicket(drafts, one, 1)
    drafts = beginAnswerNoteSave(drafts, first)
    drafts = editAnswerNote(drafts, one, '다음 요청')
    const second = answerNoteSaveTicket(drafts, one, 2)
    drafts = beginAnswerNoteSave(drafts, second)
    expect(finishAnswerNoteSave(drafts, first, '첫 요청')).toBe(drafts)
    expect(finishAnswerNoteSave(drafts, first)).toBe(drafts)
    expect(finishAnswerNoteSave(drafts, second, '다음 요청')[one]).toMatchObject({ text: '다음 요청', saved: '다음 요청' })
  })
  it('keeps a reverted edit through a failed save and the conflict refresh', () => {
    let drafts = editAnswerNote(start(), one, '보낸 말')
    const ticket = answerNoteSaveTicket(drafts, one, 1)
    drafts = beginAnswerNoteSave(drafts, ticket)
    drafts = editAnswerNote(drafts, one, '처음 말')
    drafts = finishAnswerNoteSave(drafts, ticket)
    drafts = mergeAnswerNotes(drafts, [answer(1, '에이전트가 고친 말')], asks)
    expect(drafts[one]).toMatchObject({ text: '처음 말', saved: '에이전트가 고친 말' })
    expect(drafts[one]!.pending?.failed).toBe(true)
    expect(mergeAnswerNotes(drafts, [answer(1, '에이전트가 고친 말')], asks)[one]!.text).toBe('처음 말')
  })
  it('clears failure protection after a successful retry and resumes normal refreshes', () => {
    let drafts = editAnswerNote(start(), one, '보낸 말')
    const failed = answerNoteSaveTicket(drafts, one, 1)
    drafts = beginAnswerNoteSave(drafts, failed)
    drafts = finishAnswerNoteSave(drafts, failed)
    drafts = mergeAnswerNotes(drafts, [answer(1, '처음 말')], asks)
    expect(drafts[one]!.pending?.failed).toBe(true)
    const retry = answerNoteSaveTicket(drafts, one, 2)
    drafts = beginAnswerNoteSave(drafts, retry)
    drafts = finishAnswerNoteSave(drafts, retry, '보낸 말')
    expect(drafts[one]!.pending).toBeUndefined()
    expect(mergeAnswerNotes(drafts, [answer(1, '다음 바깥 말')], asks)[one]!.text).toBe('다음 바깥 말')
  })
  it('does not affect another question when a request completes', () => {
    let drafts: AnswerNoteDrafts = { ...start(), [two]: { text: '둘째 초안', saved: '' } }
    const ticket = answerNoteSaveTicket(drafts, one, 1)
    drafts = beginAnswerNoteSave(drafts, ticket)
    expect(finishAnswerNoteSave(drafts, ticket, '처음 말')[two]).toEqual(drafts[two])
  })
})

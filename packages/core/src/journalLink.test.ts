import { describe, expect, it } from 'vitest'
import { appendJournalEntry, editJournalEntry, parseJournal, setTodoDone, type NewJournalEntry } from './journal.js'

describe('연결된 할 일의 숨은 식별자', () => {
  const link = 'project/c-20261007-1234'
  const input = { date: '2026-10-07', time: '12:34', kind: 'todo', target: '연구', text: '같은 글', link } as NewJournalEntry & { link: string }
  it('글과 식별자를 따로 읽는다', () => {
    const content = appendJournalEntry('', input)
    const entry = parseJournal(content, input.date)[0]! as ReturnType<typeof parseJournal>[number] & { link?: string }
    expect(entry.text).toBe('같은 글')
    expect(entry.link).toBe(link)
  })
  it('글·완료 표시를 고친 뒤에도 식별자를 보존한다', () => {
    const content = setTodoDone(editJournalEntry(appendJournalEntry('', input), 0, '고친 글'), 0, true)
    const entry = parseJournal(content, input.date)[0]! as ReturnType<typeof parseJournal>[number] & { link?: string }
    expect(entry).toMatchObject({ text: '고친 글', done: true, link })
  })
})

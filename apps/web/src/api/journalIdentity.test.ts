import type { JournalEntry } from '@rw/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { researchApi } from './research'

afterEach(() => vi.unstubAllGlobals())
describe('일지 요청은 읽은 연결 식별자를 전달한다', () => {
  const entry: JournalEntry = { date: '2026-10-07', time: '12:34', index: 1, kind: 'todo', target: '연구', text: '같은 글', link: 'project/c-second' }
  it.each(['setTodo', 'editJournal', 'deleteJournal'] as const)('%s가 같은 글을 가진 다른 기록을 고르지 않는다', async (method) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ entry, ok: true }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const api = researchApi('sample-research')
    if (method === 'setTodo') await api.setTodo(entry, true)
    else if (method === 'editJournal') await api.editJournal(entry, '새 글')
    else await api.deleteJournal(entry)
    const [url, options] = fetch.mock.calls[0]! as unknown as [string, RequestInit]
    if (method === 'deleteJournal') expect(new URL(url, 'http://localhost').searchParams.get('link')).toBe(entry.link)
    else expect(JSON.parse(String(options.body))).toMatchObject({ was: entry.text, link: entry.link })
  })
})

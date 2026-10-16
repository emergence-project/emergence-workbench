import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batchInvalidation, invalidationKeys, qk } from './queries'

describe('파일 알림 → 다시 받을 자료', () => {
  it('알림이 바꾸는 자료만 고른다 (일지 한 줄에 프로젝트 자료 전체를 다시 받지 않는다)', () => {
    expect(invalidationKeys({ type: 'journal', research: 'p', date: '2026-10-16' })).toEqual([['project', 'p', 'journal']])
    expect(invalidationKeys({ type: 'comments', research: 'p', target: 'project' })).toEqual([qk.summary('p')])
    expect(invalidationKeys({ type: 'note', research: 'p', file: 'workbench/notes/a/note.md', hash: null })).toEqual([qk.notes('p'), qk.topics('p'), qk.manuscripts('p'), qk.library])
    expect(invalidationKeys({ type: 'library', research: null, part: 'concepts', file: 'concepts/x.md' })).toEqual([qk.library])
    expect(invalidationKeys({ type: 'research', research: 'p' })).toEqual([qk.project('p'), qk.researches])
    for (const type of ['tasks', 'flow', 'preamble', 'records-publish'] as const) {
      expect(invalidationKeys(type === 'tasks' ? { type, research: 'p', id: 'x' } : { type, research: 'p' })).toEqual([])
    }
  })
})

describe('알림 모으기', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('잠깐 모은 키를 겹침 없이 한 번에 다시 받는다', () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
    const batch = batchInvalidation(client, 400)
    batch.add([qk.summary('p')])
    batch.add([qk.summary('p'), qk.notes('p')])
    batch.add([])
    expect(spy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([qk.summary('p'), qk.notes('p')])
    batch.add([qk.library])
    batch.cancel()
    vi.advanceTimersByTime(400)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

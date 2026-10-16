import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batchInvalidation, invalidationKeys, qk } from './queries'

describe('파일 알림 → 다시 받을 자료', () => {
  it('알림이 바꾸는 자료만 고른다 (일지 한 줄에 프로젝트 자료 전체를 다시 받지 않는다)', () => {
    expect(invalidationKeys({ type: 'journal', research: 'p', date: '2026-10-16' })).toEqual([['project', 'p', 'journal']])
    expect(invalidationKeys({ type: 'comments', research: 'p', target: 'project' })).toEqual([qk.summary('p')])
    expect(invalidationKeys({ type: 'note', research: 'p', file: 'workbench/notes/a/note.md', hash: null })).toEqual([qk.notes('p'), qk.topics('p'), qk.manuscripts('p'), qk.library, qk.agentEdits('p')])
    expect(invalidationKeys({ type: 'library', research: null, part: 'concepts', file: 'concepts/x.md' })).toEqual([qk.library, qk.agentEdits('library')])
    expect(invalidationKeys({ type: 'library', research: null, part: 'papers', file: 'papers.yaml' })).toEqual([qk.library, qk.papers])
    expect(invalidationKeys({ type: 'research', research: 'p' })).toEqual([qk.project('p'), qk.researches, qk.agentEdits('p')])
    expect(invalidationKeys({ type: 'sources', research: 'p' })).toEqual([qk.manuscripts('p'), qk.materials('p'), qk.info('p')])
    // 주제 현황 · 지운 노트는 주제 · 노트 키 아래라 함께 다시 받는다
    expect(qk.topicsOverview('p').slice(0, 3)).toEqual([...qk.topics('p')])
    expect(qk.noteTrash('p').slice(0, 3)).toEqual([...qk.notes('p')])
    // 피드백은 프로젝트 알림에 들지 않는다
    expect(['block', 'note', 'journal', 'comments'].flatMap((type) => invalidationKeys({ type, research: 'p', id: 'x', file: 'f', hash: null, date: 'd', target: 't' } as never))).not.toContainEqual(qk.feedback)
    for (const type of ['tasks', 'flow', 'preamble', 'records-publish'] as const) {
      expect(invalidationKeys(type === 'tasks' ? { type, research: 'p', id: 'x' } : { type, research: 'p' })).toEqual([])
    }
  })
})

describe('알림 모으기', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('첫 알림은 바로, 뒤따르는 알림은 잠깐 모아 겹침 없이 한 번에 다시 받는다', () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
    const keys = () => spy.mock.calls.map(([f]) => f?.queryKey)
    const batch = batchInvalidation(client, 400)
    batch.add([qk.summary('p')])
    expect(keys()).toEqual([qk.summary('p')])
    batch.add([qk.summary('p'), qk.notes('p')])
    batch.add([qk.notes('p')])
    batch.add([])
    expect(spy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(400)
    expect(keys()).toEqual([qk.summary('p'), qk.summary('p'), qk.notes('p')])
    // 조용해진 뒤의 알림은 다시 바로
    vi.advanceTimersByTime(400)
    batch.add([qk.library])
    expect(keys().at(-1)).toEqual(qk.library)
    batch.add([qk.papers])
    batch.cancel()
    vi.advanceTimersByTime(800)
    expect(spy).toHaveBeenCalledTimes(4)
  })
})

import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { batchInvalidation, invalidationKeys, qk } from './queries'

describe('파일 알림 → 다시 받을 자료', () => {
  it('알림이 바꾸는 자료만 고른다 (일지 한 줄에 프로젝트 자료 전체를 다시 받지 않는다)', () => {
    expect(invalidationKeys({ type: 'journal', research: 'p', date: '2026-10-16' })).toEqual([['project', 'p', 'journal'], qk.recordsUnpublished('p'), qk.status('p')])
    expect(invalidationKeys({ type: 'comments', research: 'p', target: 'project' })).toEqual([qk.summary('p'), qk.records('p'), qk.recordsUnpublished('p'), ['network', 'person'], qk.status('p')])
    expect(invalidationKeys({ type: 'note', research: 'p', file: 'workbench/notes/a/note.md', hash: null })).toEqual([qk.notes('p'), qk.topics('p'), qk.manuscripts('p'), qk.library, qk.agentEdits('p'), qk.records('p'), qk.repoFiles('p'), qk.status('p')])
    expect(invalidationKeys({ type: 'library', research: null, part: 'concepts', file: 'concepts/x.md' })).toEqual([qk.library, qk.agentEdits('library')])
    expect(invalidationKeys({ type: 'library', research: null, part: 'papers', file: 'papers.yaml' })).toEqual([qk.library, qk.papers])
    expect(invalidationKeys({ type: 'research', research: 'p' })).toEqual([qk.project('p'), qk.researches, qk.agentEdits('p')])
    expect(invalidationKeys({ type: 'sources', research: 'p' })).toEqual([qk.manuscripts('p'), qk.materials('p'), qk.info('p'), qk.repoFiles('p'), qk.peopleSuggestions, ['network', 'person'], qk.status('p')])
    // 기록 글 속 경로 하나의 키는 경로 전부의 키 아래라 함께 다시 받는다
    expect(qk.repoFile('p', 'a.md', true).slice(0, 3)).toEqual([...qk.repoFiles('p')])
    // 주제 현황 · 지운 노트는 주제 · 노트 키 아래라 함께 다시 받는다
    expect(qk.topicsOverview('p').slice(0, 3)).toEqual([...qk.topics('p')])
    expect(qk.noteTrash('p').slice(0, 3)).toEqual([...qk.notes('p')])
    // 피드백은 프로젝트 알림에 들지 않는다
    expect(['block', 'note', 'journal', 'comments'].flatMap((type) => invalidationKeys({ type, research: 'p', id: 'x', file: 'f', hash: null, date: 'd', target: 't' } as never))).not.toContainEqual(qk.feedback)
    // 맡긴 일 파일은 맡긴 일과 현황만
    expect(invalidationKeys({ type: 'tasks', research: 'p', id: 'x' })).toEqual([qk.tasks('p'), qk.status('p')])
    // 현황(STATUS.md와 같은 글)은 그 프로젝트의 어느 파일에서나 뽑으므로 모든 알림에 든다. research는 프로젝트 키 전체라 따로 넣지 않는다
    expect(invalidationKeys({ type: 'flow', research: 'p' })).toEqual([qk.flow('p'), qk.status('p')])
    expect(invalidationKeys({ type: 'preamble', research: 'p' })).toEqual([qk.status('p')])
    // 기록 올리기 결과가 바뀌면(실패가 생기거나 풀림) 그 결과와 안 올린 기록 (기록 탭 맨 위 줄 · 실패 알림 · 맥락 칸 올리기)
    expect(invalidationKeys({ type: 'records-publish', research: 'p' })).toEqual([qk.recordsPublish('p'), qk.status('p')])
    expect(qk.recordsUnpublished('p').slice(0, 3)).toEqual([...qk.recordsPublish('p')])
    expect(qk.status('p').slice(0, 2)).toEqual([...qk.project('p')])
    expect(qk.tasks('p').slice(0, 2)).toEqual([...qk.project('p')])
  })

  it('네트워킹: 사람 목록 · 추천 · 사람 페이지는 한 키 아래, 새 논문은 그 밖에', () => {
    // 사람 목록을 저장하면(announce) qk.network 하나로 사이드바 · 첫 화면 · 추천 · 사람 페이지를 다시 받는다
    for (const key of [qk.people, qk.peopleSuggestions, qk.person('a-b')]) expect(key.slice(0, 1)).toEqual([...qk.network])
    // 새 논문은 사람 목록을 저장해도 다시 찾지 않는다(본 것으로 적기 → 사람 목록 다시 받기가 되풀이되지 않게)
    expect(qk.personNewPapers('a-b', '', 'A B')[0]).not.toEqual(qk.network[0])
    // 프로젝트 bib(sources)는 추천과 사람 페이지를, 기록(comments)은 사람 페이지의 "나오는 곳"만 다시 받는다. 사람 목록은 설정 폴더라 프로젝트 알림과 상관없다
    const sources = invalidationKeys({ type: 'sources', research: 'p' })
    const comments = invalidationKeys({ type: 'comments', research: 'p', target: 'project' })
    expect(qk.person('a-b').slice(0, 2)).toEqual(['network', 'person'])
    for (const keys of [sources, comments]) expect(keys).not.toContainEqual(qk.people)
    expect(comments).not.toContainEqual(qk.peopleSuggestions)
    // 노트 · 블록 · 일지 알림은 네트워킹 자료를 건드리지 않는다
    for (const type of ['block', 'note', 'journal', 'tasks', 'flow'] as const) {
      const keys = invalidationKeys({ type, research: 'p', id: 'x', file: 'f', hash: null, date: 'd' } as never)
      expect(keys.some((k) => k[0] === 'network')).toBe(false)
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

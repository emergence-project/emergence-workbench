import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api, notesApi, type ManuscriptInfo, type NoteRow, type Topic } from './api'
import { qk } from './queries'

/**
 * 읽어 와서 넣는다. 효과가 끝나면(프로젝트를 옮기거나 다시 읽으면) 늦게 온 앞 응답은 버린다:
 * 그러지 않으면 프로젝트를 빨리 옮길 때 앞 프로젝트의 목록이 뒤에 도착해 새 프로젝트 화면에 남는다.
 */
export function fill<T>(get: () => Promise<T>, set: (v: T) => void, fallback: T): () => void {
  let live = true
  get().then((v) => { if (live) set(v) }, () => { if (live) set(fallback) })
  return () => { live = false }
}

/**
 * 지금 프로젝트의 사이드바·탭 제목이 함께 쓰는 자료: 공유 라이브러리, 메인 노트(원고), 주제 카드, 노트 목록.
 * 화면 캐시(queries.ts)에 프로젝트마다 둔다: 파일 알림은 바뀐 자료만 다시 받고(invalidationKeys), 앞에 연 프로젝트로 돌아가면 바로 보인다.
 */
export function useProjectData(rid: string | null) {
  const client = useQueryClient()
  const off = !rid
  // 공유 라이브러리 (개념노트·문헌노트, 쓰는 곳)
  const library = useQuery({ queryKey: qk.library, queryFn: () => api.library() }).data ?? null
  const libraryChanged = useCallback(() => { void client.invalidateQueries({ queryKey: qk.library }) }, [client])
  // 메인 노트 = 원고 (research.yaml sources.manuscript, 여럿일 수 있음) — 없으면 빈 목록
  const manuscripts = useQuery({ queryKey: qk.manuscripts(rid ?? ''), queryFn: () => api.research(rid!).manuscripts(), enabled: !off }).data ?? NONE_MS
  // 소문제 카드 (research.yaml topics:) — 없으면 빈 목록
  const topics = useQuery({ queryKey: qk.topics(rid ?? ''), queryFn: () => api.research(rid!).topics(), enabled: !off }).data ?? NONE_TOPICS
  // 노트 한 목록 (연구노트·계산 노트·보조 노트, 10/5): 왼쪽 사이드바 나무 · 위치 표시 · 오른쪽 사이드바 정보
  const noteQuery = useQuery({ queryKey: qk.notes(rid ?? ''), queryFn: () => notesApi(rid!).list(), enabled: !off })
  const notes = (!off && noteQuery.data) || NONE_NOTES
  /** notes가 어느 프로젝트의 목록인지 (받기 전에는 null) */
  const notesOf = !off && noteQuery.data ? rid : null
  const notesChanged = useCallback(() => { if (rid) void client.invalidateQueries({ queryKey: qk.notes(rid) }) }, [client, rid])
  return { library, libraryChanged, manuscripts: off ? NONE_MS : manuscripts, topics: off ? NONE_TOPICS : topics, notes, notesOf, notesChanged }
}

// 받기 전의 빈 목록은 늘 같은 값(렌더마다 새 배열이면 그것을 deps로 쓰는 효과가 매번 돈다)
const NONE_MS: ManuscriptInfo[] = []
const NONE_TOPICS: Topic[] = []
const NONE_NOTES: NoteRow[] = []

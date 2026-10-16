import type { JournalEntry } from '@rw/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentEditsApi, api, notesApi, papersApi, type ResearchApi } from './api'
import { qk } from './queries'

/**
 * 여러 화면이 함께 읽는 서버 자료 (화면 캐시, queries.ts). 같은 키를 쓰는 화면은 요청 하나를 나눠 쓰고,
 * 파일 알림은 invalidationKeys가 고른 키만 다시 받는다. 고친 뒤에는 그 키를 invalidate한다.
 */

/** 프로젝트 정보 (sources · 작업 목록 · 검토 문서). 받지 못하면 null */
export function useProjectInfo(rid: string) {
  return useQuery({ queryKey: qk.info(rid), queryFn: () => api.research(rid).project().catch(() => null) })
}

/** 에이전트 고침 검토 목록 (scope: 프로젝트 id 또는 library) */
export function useAgentEdits(scope: string) {
  return useQuery({ queryKey: qk.agentEdits(scope), queryFn: () => agentEditsApi.list(scope) })
}

export function useMaterials(rid: string) {
  return useQuery({ queryKey: qk.materials(rid), queryFn: () => api.research(rid).materials() })
}

/** 라이브러리 논문 목록. 받지 못하면 null */
export function usePapers() {
  return useQuery({ queryKey: qk.papers, queryFn: () => papersApi.list().catch(() => null) })
}

export function useTopicsOverview(rid: string) {
  return useQuery({ queryKey: qk.topicsOverview(rid), queryFn: () => notesApi(rid).topicsOverview() })
}

export function useNoteTrash(rid: string) {
  return useQuery({ queryKey: qk.noteTrash(rid), queryFn: () => api.research(rid).noteTrash().catch(() => []) })
}

/** 첫 화면과 작업 화면 · 홈이 함께 읽는 일지 (최근 365일). 다른 프로젝트의 늦은 응답은 키가 달라 섞이지 않는다 */
export function useJournal(rapi: ResearchApi) {
  const client = useQueryClient()
  const key = qk.journal(rapi.rid, 365)
  const q = useQuery({ queryKey: key, queryFn: () => rapi.journal(365) })
  const reload = () => client.invalidateQueries({ queryKey: key })
  const toggle = (e: JournalEntry) => { rapi.setTodo(e, !e.done).then(reload).catch(() => undefined) }
  return { entries: q.data?.entries ?? NONE, loaded: q.isFetched && !q.isFetching, reload, toggle }
}
const NONE: JournalEntry[] = []

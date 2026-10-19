import type { JournalEntry } from '@rw/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentEditsApi, api, commentsApi, notesApi, papersApi, tasksApi, type ResearchApi } from './api'
import { flash } from './flash'
import { qk } from './queries'
import { taskTitles } from './taskView'

/**
 * 여러 화면이 함께 읽는 서버 자료 (화면 캐시, queries.ts). 같은 키를 쓰는 화면은 요청 하나를 나눠 쓰고,
 * 파일 알림은 invalidationKeys가 고른 키만 다시 받는다. 고친 뒤에는 그 키를 invalidate한다.
 */

/** 프로젝트 정보 (sources · 작업 목록 · 검토 문서). 받지 못하면 null */
export function useProjectInfo(rid: string) {
  return useQuery({ queryKey: qk.info(rid), queryFn: () => api.research(rid).project().catch(() => null) })
}

/** 프로젝트와 모든 노트의 기록 (작업 탭의 기록 · 오른쪽 기록 패널이 함께 쓴다). 여기서 고친 기록은 bumpPending이 다시 받게 한다 */
export function useRecords(rid: string, enabled = true) {
  return useQuery({ queryKey: qk.records(rid), queryFn: () => commentsApi(rid).records(), enabled })
}

/** 에이전트 고침 검토 목록 (scope: 프로젝트 id 또는 library) */
export function useAgentEdits(scope: string) {
  return useQuery({ queryKey: qk.agentEdits(scope), queryFn: () => agentEditsApi.list(scope) })
}

/** 맡긴 일과 그 파일의 진단. 받지 못하면 error (화면은 "맡긴 일이 없습니다" 대신 오류 글을 보인다) */
export function useTaskScan(rid: string) {
  return useQuery({
    queryKey: qk.tasks(rid),
    queryFn: () => tasksApi(rid).scan().then((r) => { for (const x of r.tasks) taskTitles.set(x.id, x.title); return r }),
  })
}

/** 현황 글 (STATUS.md와 같은 것). 받지 못하면 null */
export function useAgentStatus(rid: string, rapi: ResearchApi) {
  return useQuery({ queryKey: qk.status(rid), queryFn: () => rapi.agentStatus().then((r) => r.markdown).catch(() => null) })
}

export function useMaterials(rid: string) {
  return useQuery({ queryKey: qk.materials(rid), queryFn: () => api.research(rid).materials() })
}

/** 라이브러리 논문 목록. 받지 못하면 null */
export function usePapers() {
  return useQuery({ queryKey: qk.papers, queryFn: () => papersApi.list().catch(() => null) })
}

export function useTopicsOverview(rid: string, enabled = true) {
  return useQuery({ queryKey: qk.topicsOverview(rid), queryFn: () => notesApi(rid).topicsOverview(), enabled })
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
  const toggle = (e: JournalEntry) => { rapi.setTodo(e, !e.done).then(reload).catch((err: Error) => flash(err.message)) }
  return { entries: q.data?.entries ?? NONE, loaded: q.isFetched && !q.isFetching, reload, toggle }
}
const NONE: JournalEntry[] = []

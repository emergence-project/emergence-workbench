import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type ProjectIssues, type ResearchListItem } from './api'
import { issueTip } from './projectProfile'
import { qk } from './queries'

const EMPTY: ProjectIssues = { counts: {}, tasks: {}, edits: {}, records: {} }

/**
 * 프로젝트마다 확인할 것의 수: 판단할 맡긴 일(결과 · 종결 조건 제안, 10/7) + 에이전트 고침 + 에이전트가 물은 기록.
 * 왼쪽 띠의 프로젝트 버튼과 홈의 "확인 필요" 점에 쓴다 (10/4 18:16 피드백 "다른 요소들도 확인할 변동이 있다면 알림을").
 * 화면 캐시(qk.researchIssues)라 폰 내 차례와 요청 하나를 나눠 쓰고, 노트 · 작업 · 기록 알림이 오면 다시 센다(invalidationKeys).
 * 프로젝트를 등록하거나 빼면 파일 알림이 없으므로 프로젝트가 바뀔 때도 다시 센다.
 */
export function useProjectIssues(researches: ResearchListItem[] | null): ProjectIssues {
  const client = useQueryClient()
  const q = useQuery({ queryKey: qk.researchIssues, queryFn: () => api.researchIssues(), enabled: researches !== null })
  const ids = researches?.map((r) => r.id).sort().join(' ')
  const seen = useRef(ids)
  useEffect(() => {
    if (seen.current === ids) return
    const first = seen.current === undefined
    seen.current = ids
    if (!first) void client.invalidateQueries({ queryKey: qk.researchIssues })
  }, [ids, client])
  return { ...EMPTY, ...q.data }
}

export function ProjectRailCount({ n, tasks, edits, records }: { n: number | undefined; tasks?: number; edits?: number; records?: number }) {
  if (!n) return null
  return <span className="rail-count" data-ui="확인할 보조 노트 수" title={issueTip(tasks ?? 0, edits ?? 0, records ?? 0)}>{n}</span>
}

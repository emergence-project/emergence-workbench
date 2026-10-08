import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ProjectIssues, type ResearchListItem, type WorkbenchEvent } from './api'
import { issueTip } from './projectProfile'

const EMPTY: ProjectIssues = { counts: {}, notes: {}, tasks: {}, edits: {} }

/**
 * 프로젝트마다 확인할 것의 수: 확인이 필요한 노트(첫 화면의 "확인이 필요한 노트 N"과 같다) + 판단할 맡긴 일(결과 · 종결 조건 제안, 10/7).
 * 왼쪽 띠의 프로젝트 버튼과 홈의 "확인 필요" 점에 쓴다 (10/4 18:16 피드백 "다른 요소들도 확인할 변동이 있다면 알림을").
 * 프로젝트 목록이 바뀌거나 노트 · 작업 파일이 바뀌면 잠깐(0.4초) 모았다가 다시 센다.
 */
export function useProjectIssues(researches: ResearchListItem[] | null): ProjectIssues & { onEvent(e: WorkbenchEvent): void } {
  const [issues, setIssues] = useState<ProjectIssues>(EMPTY)
  const timer = useRef<number | undefined>(undefined)
  const load = useCallback(() => { api.researchIssues().then((v) => setIssues({ ...EMPTY, ...v })).catch(() => undefined) }, [])
  useEffect(() => { if (researches) load() }, [researches, load])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  /** App의 파일 변경 알림에서 부른다 (알림 연결을 따로 열지 않는다) */
  const onEvent = useCallback((e: WorkbenchEvent) => {
    if (e.type !== 'block' && e.type !== 'research' && e.type !== 'tasks' && e.type !== 'note') return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(load, 400)
  }, [load])
  return { ...issues, onEvent }
}

export function ProjectRailCount({ n, notes, tasks, edits }: { n: number | undefined; notes?: number; tasks?: number; edits?: number }) {
  if (!n) return null
  return <span className="rail-count" data-ui="확인할 보조 노트 수" title={issueTip(notes ?? n, tasks ?? 0, edits ?? 0)}>{n}</span>
}

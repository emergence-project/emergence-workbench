import { useQueries, useQuery } from '@tanstack/react-query'
import { taskTurn, userTurn } from '@rw/core'
import { api, commentsApi, tasksApi, type FeedbackItem, type ResearchListItem, type Task } from '../api'
import { t } from '../i18n'
import { qk } from '../queries'
import { judgeOrder } from '../taskView'
import { userTurnRecords, type FlatRecord } from '../workRecords'

/**
 * 폰의 내 차례 (10/31 사용자 결정 "안 A · 내 차례 먼저", 시안 https://claude.ai/artifact/M7D5NatDAN9agDCJTmPpop):
 * 모든 프로젝트에서 나를 기다리는 것을 한 목록으로. 계산은 맥 화면과 같다 —
 * 피드백은 피드백 화면의 "확인 필요"(userTurn), 기록은 기록 › 내 차례(userTurnRecords), 맡긴 일은 판단 카드(judgeOrder),
 * 수정 검토는 홈 카드의 수(research-issues edits), 흐름은 결정을 기다리는 방향 보고의 수(research-issues problems, 레일 · 사이드바 기록 줄이 세는 것).
 */
export type TurnItem =
  | { kind: 'feedback'; key: string; at: string; item: FeedbackItem; turn: 'answer' | 'confirm' }
  | { kind: 'record'; key: string; at: string; rid: string; project: string; rec: FlatRecord }
  | { kind: 'task'; key: string; at: string; rid: string; project: string; task: Task }
  | { kind: 'flow'; key: string; at: string; rid: string; project: string; n: number }
  | { kind: 'edits'; key: string; at: string; rid: string; project: string; n: number }

/** 확인만 (11/23 결정 필요 · 확인만): 반영이 끝난 피드백과 종결 조건을 통과한 맡긴 일. 탭 수 · 알림에 넣지 않는다 */
export const isConfirm = (x: TurnItem) => (x.kind === 'feedback' && x.turn === 'confirm') || (x.kind === 'task' && taskTurn(x.task) === 'confirm')

export const TURN_GROUPS = ['feedback', 'record', 'task', 'flow', 'edits'] as const satisfies TurnItem['kind'][]

export function useTurns(): { items: TurnItem[]; loading: boolean; projects: ResearchListItem[]; failed: string[] } {
  const list = useQuery({ queryKey: qk.researches, queryFn: () => api.researches() })
  const projects = (list.data?.researches ?? []).filter((r) => r.available && r.state === 'active')
  const feedback = useQuery({ queryKey: qk.feedbackAll, queryFn: () => api.feedbackAll() })
  // 수정 검토 · 흐름 결정의 수: 레일 · 홈과 같은 자료 (useProjectIssues)
  const issues = useQuery({ queryKey: qk.researchIssues, queryFn: () => api.researchIssues(), enabled: projects.length > 0 })
  const records = useQueries({ queries: projects.map((r) => ({ queryKey: qk.records(r.id), queryFn: () => commentsApi(r.id).records() })) })
  const tasks = useQueries({ queries: projects.map((r) => ({ queryKey: qk.tasks(r.id), queryFn: () => tasksApi(r.id).scan() })) })

  const items: TurnItem[] = []
  for (const e of feedback.data?.enabled ? feedback.data.entries : []) {
    const turn = userTurn(e)
    if (turn) items.push({ kind: 'feedback', key: `fb:${e.key}`, at: e.status?.handled_at ?? `${e.date}T${e.time}`, item: e, turn })
  }
  projects.forEach((r, i) => {
    for (const rec of userTurnRecords(records[i]?.data?.files ?? [])) items.push({ kind: 'record', key: `rec:${r.id}:${rec.file.target}:${rec.entry.id}`, at: rec.entry.id, rid: r.id, project: r.title, rec })
    for (const task of judgeOrder(tasks[i]?.data?.tasks ?? [])) items.push({ kind: 'task', key: `task:${r.id}:${task.id}`, at: task.resultAt ?? '', rid: r.id, project: r.title, task })
    const flows = issues.data?.problems[r.id] ?? 0
    if (flows) items.push({ kind: 'flow', key: `flow:${r.id}`, at: '', rid: r.id, project: r.title, n: flows })
    const n = issues.data?.edits[r.id] ?? 0
    if (n) items.push({ kind: 'edits', key: `edits:${r.id}`, at: '', rid: r.id, project: r.title, n })
  })
  const loading = list.isPending || feedback.isPending || records.some((q) => q.isPending) || tasks.some((q) => q.isPending)
  // 받지 못한 것: 그 묶음이 없는 것으로 보이지 않게 이름을 돌려준다 (11/27: 피드백을 못 읽으면 피드백 답 묶음이 말없이 빠졌다)
  const failed = [
    list.isError && t('프로젝트 목록', 'the project list'),
    feedback.isError && t('피드백', 'feedback'),
    records.some((q) => q.isError) && t('기록', 'records'),
    tasks.some((q) => q.isError) && t('맡긴 일', 'delegated tasks'),
    issues.isError && t('수정 검토 · 흐름', 'edit reviews and flows'),
  ].filter((x): x is string => !!x)
  return { items, loading, projects, failed }
}

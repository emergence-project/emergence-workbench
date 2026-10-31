import { useQueries, useQuery } from '@tanstack/react-query'
import { userTurn } from '@rw/core'
import { api, commentsApi, tasksApi, type FeedbackItem, type ResearchListItem, type Task } from '../api'
import { qk } from '../queries'
import { judgeOrder } from '../taskView'
import { userTurnRecords, type FlatRecord } from '../workRecords'

/**
 * 폰의 내 차례 (10/31 사용자 결정 "안 A · 내 차례 먼저", 시안 https://claude.ai/artifact/M7D5NatDAN9agDCJTmPpop):
 * 모든 프로젝트에서 나를 기다리는 것을 한 목록으로. 계산은 맥 화면과 같다 —
 * 피드백은 피드백 화면의 "확인 필요"(userTurn), 기록은 기록 › 내 차례(userTurnRecords), 맡긴 일은 판단 카드(judgeOrder),
 * 수정 검토는 홈 카드의 수(research-issues edits).
 */
export type TurnItem =
  | { kind: 'feedback'; key: string; at: string; item: FeedbackItem; turn: 'answer' | 'confirm' }
  | { kind: 'record'; key: string; at: string; rid: string; project: string; rec: FlatRecord }
  | { kind: 'task'; key: string; at: string; rid: string; project: string; task: Task }
  | { kind: 'edits'; key: string; at: string; rid: string; project: string; n: number }

export const TURN_GROUPS = ['feedback', 'record', 'task', 'edits'] as const satisfies TurnItem['kind'][]

/** 피드백 화면과 같은 키라 요청 하나를 나눠 쓴다 (FeedbackPage FEEDBACK_ALL) */
const FEEDBACK_ALL = [...qk.feedback, 'all'] as const

export function useTurns(version: number): { items: TurnItem[]; loading: boolean; projects: ResearchListItem[] } {
  const list = useQuery({ queryKey: qk.researches, queryFn: () => api.researches() })
  const projects = (list.data?.researches ?? []).filter((r) => r.available && r.state === 'active')
  const feedback = useQuery({ queryKey: FEEDBACK_ALL, queryFn: () => api.feedbackAll() })
  // 수정 검토 수는 파일 알림을 따로 받지 않으므로 App의 version(알림마다 바뀜)에 묶는다
  const issues = useQuery({ queryKey: ['research-issues', version], queryFn: () => api.researchIssues(), enabled: projects.length > 0 })
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
    const n = issues.data?.edits[r.id] ?? 0
    if (n) items.push({ kind: 'edits', key: `edits:${r.id}`, at: '', rid: r.id, project: r.title, n })
  })
  const loading = list.isPending || feedback.isPending || records.some((q) => q.isPending) || tasks.some((q) => q.isPending)
  return { items, loading, projects }
}

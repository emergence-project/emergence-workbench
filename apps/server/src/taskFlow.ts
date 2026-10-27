// 맡긴 일의 결과 승인 → 흐름 (10/27 결정 "맡긴 일과 흐름 점 잇기" (a)).
// 사용자가 이은 점(flow 칸)이 아직 끝나지 않은 여는 점 · 작업 점이면 끝남 · 해결로 두고,
// 맡긴 일의 결론을 진술로 한 닫는 점(명제)을 새로 만들어 승인 판단을 붙인다. 이은 점이 없으면 흐름은 그대로다.
import type { Task } from '@rw/core/contract/tasks'
import type { FlowNode } from '@rw/core/contract/flow'
import { createFlowNode, judgeFlow, patchFlowNode, scanFlow } from './flow.js'
import { judgeTask } from './tasks.js'
import type { Workbench } from './workbench.js'
import type * as C from '@rw/core/contract/tasks'

const WORK = new Set(['calc', 'analytic', 'proof', 'literature'])

/** 짧은 이름: 점 이름 칸(60자)에 맞게 */
const shortOf = (s: string) => ([...s].length > 60 ? `${[...s].slice(0, 59).join('')}…` : s)

/** 판단하고, 결과를 승인했으면 흐름에 반영한다. 반영한 점 id를 함께 돌려준다 */
export function judgeTaskIntoFlow(wb: Workbench, id: string, body: C.JudgeBody, now = new Date()): { task: Task; closed?: string; added?: string } {
  const task = judgeTask(wb, id, body, now)
  if (body.verdict !== 'approve' || task.state !== 'done' || !task.flow) return { task }
  return { task, ...approveIntoFlow(wb, task, now) }
}

function scanFlowSafe(wb: Workbench): FlowNode[] {
  try { return scanFlow(wb).nodes } catch { return [] }
}

export function approveIntoFlow(wb: Workbench, task: Task, now = new Date()): { closed?: string; added?: string } {
  const n = scanFlowSafe(wb).find((x) => x.id === task.flow)
  if (!n || n.progress === 'done' || (n.kind !== 'question' && !WORK.has(n.kind))) return {}
  const conclusion = task.conclusion?.trim()
  const fields = WORK.has(n.kind) && conclusion && !n.fields.result ? { ...n.fields, result: conclusion } : undefined
  patchFlowNode(wb, n.id, { baseHash: n.hash, set: { progress: 'done', result: 'solved', ...(fields && { fields }) } }, now)
  if (!conclusion) return { closed: n.id }
  const made = createFlowNode(wb, {
    kind: 'finding', short: shortOf(task.title), title: task.title, ...(n.topics.length && { topics: n.topics }),
    from: [{ id: n.id, type: n.kind === 'question' ? 'origin' : 'support' }], progress: 'done', by: task.agent, task: task.id,
  }, now, { approved: true })
  const filled = patchFlowNode(wb, made.id, {
    baseHash: made.hash,
    set: { fields: { statement: conclusion }, evidence: [{ kind: 'other', title: task.title, file: task.file, text: `맡긴 일 보고서 (결과 ${task.resultAt ?? ''} · 승인 ${task.check.human ?? ''})`.replace(/\s+/g, ' ').trim() }] },
  }, now)
  judgeFlow(wb, made.id, { baseHash: filled.hash, verdict: 'approve', note: `맡긴 일 결과 승인: ${task.id}` }, 'user', now)
  return { closed: n.id, added: made.id }
}

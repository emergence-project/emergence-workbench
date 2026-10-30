// 맡긴 일의 결과 승인 → 흐름 (10/27 결정 "맡긴 일과 흐름 점 잇기" (a)).
// 사용자가 이은 점(flow 칸)이 아직 끝나지 않은 여는 점 · 작업 점이면 끝남 · 해결로 두고,
// 맡긴 일의 결론을 진술로 한 닫는 점(명제)을 새로 만들어 승인 판단을 붙인다. 이은 점이 없으면 흐름은 그대로다.
import fs from 'node:fs'
import path from 'node:path'
import type { Task } from '@rw/core/contract/tasks'
import { FLOW_FIELDS, WORK_KINDS, type FlowNode } from '@rw/core/contract/flow'
import { stamp as coreStamp } from '@rw/core'
import { createFlowNode, judgeFlow, patchFlowNode, scanFlow, setFlowRecord } from './flow.js'
import { priorSearch, startQuery } from './flowStart.js'
import { createTask, judgeTask, linkTaskFlow, nextTask, readTask, taskIdFor, type NewTask } from './tasks.js'
import { localDate } from './fsutil.js'
import type { Workbench } from './workbench.js'
import type { z } from 'zod'
import * as C from '@rw/core/contract/tasks'

const WORK = new Set<string>(WORK_KINDS)

/**
 * 맡기기 → 작업 점 (10/30 결정 "흐름 차트 동결 · 카드 입구"): 주제나 흐름 점이 있는 맡긴 일은 그 일이 곧 작업 점이다.
 * 점은 사람이 차트에서 만들지 않고 앱이 여기서 만든다. 이은 점(flow)이 끝나지 않은 작업 점이면 그 점을 이어 받고 새로 만들지 않는다.
 * 질문 · 명제를 이으면 그 아래에 작업 점을 만든다(질문이면 발단, 명제면 사용 선). 종결 조건이 있으면 진행, 없으면 미해결(에이전트가 먼저 제안한다).
 * 시작 기록에는 선행 찾기(걸린 점)와 판정 기준(종결 조건)을 적어, 같은 일을 되풀이하기 전에 지난 시도가 보이게 한다(목적 ④).
 * 주제도 흐름 점도 없는 일(앱 · 저장소 손질 같은 것)은 흐름에 점을 두지 않는다
 */
export function createTaskWithDot(wb: Workbench, input: NewTask, now = new Date()): { task: Task; dot?: FlowNode; hits: string[] } {
  const flow = input.flow?.trim() || undefined
  const topic = input.topic?.trim() || undefined
  if (!flow && !topic) return { task: createTask(wb, input, now), hits: [] }
  const nodes = scanFlowSafe(wb)
  const linked = flow ? nodes.find((n) => n.id === flow) : undefined
  if (flow && !linked) return { task: createTask(wb, input, now), hits: [] } // 없는 점은 createTask가 거절하거나 글로 남는다
  if (linked && WORK.has(linked.kind) && linked.progress !== 'done') {
    const task = createTask(wb, input, now)
    return { task, dot: linked, hits: linked.start?.hits ?? [] }
  }
  const id = taskIdFor(wb, input.title.replace(/\s+/g, ' ').trim(), localDate(now))
  const kind = input.kind ?? 'calc'
  const end = input.endCondition?.trim() || undefined
  const title = input.title.replace(/\s+/g, ' ').trim()
  const short = [...title].length > 60 ? `${[...title].slice(0, 59).join('')}…` : title
  const hasCriterion = FLOW_FIELDS[kind].includes('criterion')
  const by = input.by?.trim() || 'user'
  let dot = createFlowNode(wb, {
    kind, short, title, ...(topic && { topics: [topic] }), by, task: id, progress: end ? 'active' : 'open',
    ...(linked && { from: [{ id: linked.id, type: linked.kind === 'question' ? 'origin' : 'use' }] }),
  }, now)
  try {
    const query = startQuery({ short, title, fields: { goal: input.task } })
    const hits = priorSearch(wb, query, dot.id)
    dot = patchFlowNode(wb, dot.id, { baseHash: dot.hash, set: { fields: { goal: input.task.trim(), ...(end && hasCriterion && { criterion: end }) } } }, now)
    dot = setFlowRecord(wb, dot.id, 'start', {
      at: coreStamp('t', now), by, query, hits: hits.map((h) => h.id), prior: [],
      novel: hits.length ? undefined : `맡긴 일 ${id}에서 열림 · 걸린 지난 시도 없음`, ...(end && !hasCriterion && { criterion: end }),
    }, dot.hash)
    const task = linkTaskFlow(wb, createTask(wb, { ...input, flow: undefined }, now).id, { flow: dot.id, baseHash: '' }, { skipHash: true })
    return { task, dot, hits: hits.map((h) => h.id) }
  } catch (e) {
    try { fs.rmSync(path.join(wb.root, 'flow', `${dot.id}.yaml`), { force: true }) } catch { /* 점을 못 지워도 일 만들기 오류를 알린다 */ }
    throw e
  }
}

/** 다음 지시를 맡길 때도 같은 길로 (nextTask의 started를 작업 점과 함께 만든다) */
export function nextTaskWithDot(wb: Workbench, id: string, body: z.output<typeof C.NextBody>, now = new Date()): { task: Task; started?: Task } {
  if (body.action !== 'start') return nextTask(wb, id, body, now)
  return nextTask(wb, id, body, now, (input) => createTaskWithDot(wb, input, now).task)
}

/** 종결 조건 제안을 승인하면 작업 점이 진행이 되고 판정 기준이 그 조건이 된다 */
function startIntoFlow(wb: Workbench, task: Task, now: Date): void {
  if (!task.flow || !task.endCondition) return
  const n = scanFlowSafe(wb).find((x) => x.id === task.flow)
  if (!n || n.task !== task.id || n.progress === 'done') return
  const hasCriterion = FLOW_FIELDS[n.kind].includes('criterion')
  const fields = hasCriterion ? { ...n.fields, criterion: task.endCondition } : undefined
  const patched = patchFlowNode(wb, n.id, { baseHash: n.hash, set: { ...(n.progress === 'open' && { progress: 'active' }), ...(fields && { fields }) } }, now)
  if (!hasCriterion && n.start) setFlowRecord(wb, n.id, 'start', { ...n.start, criterion: task.endCondition }, patched.hash)
}

/** 짧은 이름: 점 이름 칸(60자)에 맞게 */
const shortOf = (s: string) => ([...s].length > 60 ? `${[...s].slice(0, 59).join('')}…` : s)

/** 판단하고, 결과를 승인했으면 흐름에 반영한다. 반영한 점 id를 함께 돌려준다 */
export function judgeTaskIntoFlow(wb: Workbench, id: string, body: C.JudgeBody, now = new Date()): { task: Task; closed?: string; added?: string } {
  const before = readTask(wb, id).state
  const task = judgeTask(wb, id, body, now)
  if (body.verdict === 'approve' && before === 'proposed') { startIntoFlow(wb, task, now); return { task } }
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

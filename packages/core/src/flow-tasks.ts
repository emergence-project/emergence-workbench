// 맡긴 일 ↔ 흐름 점 (10/26 결정 "흐름 연결" ①·③): 서버(흐름 찾기 · STATUS)와 화면(짝 제안 · 칩)이 같은 계산을 쓴다.
// 짝은 셋 중 먼저 걸리는 것: 맡긴 일의 flow 칸 · 점의 task 칸(그 일이 만든 점) · 맡긴 일 글에 적힌 점 이름.
import type { FlowNode } from './contract/flow.js'
import type { Task } from './contract/tasks.js'

export type TaskLinkHow = 'field' | 'dot' | 'text'
export interface TaskLink { task: Task; how: TaskLinkHow }

/** 글에 적힌 점 이름: `workbench/flow/<id>.yaml` 또는 "흐름 점 <id>" */
const MENTION = [/workbench\/flow\/([a-z0-9][a-z0-9-]*)\.yaml/g, /흐름 점 `?([a-z0-9][a-z0-9-]*)/g]

function mentioned(t: Task, ids: Set<string>): string[] {
  const hay = [t.task, ...t.references, t.endCondition ?? '', t.body].join('\n')
  const out = new Set<string>()
  for (const re of MENTION) for (const m of hay.matchAll(re)) if (ids.has(m[1]!)) out.add(m[1]!)
  return [...out]
}

/** 점 id → 이어진 맡긴 일 (만든 순). 폐기한 일은 뺀다 */
export function taskLinks(nodes: Pick<FlowNode, 'id' | 'task'>[], tasks: Task[]): Map<string, TaskLink[]> {
  const ids = new Set(nodes.map((n) => n.id))
  const out = new Map<string, TaskLink[]>()
  const add = (id: string, task: Task, how: TaskLinkHow) => {
    const list = out.get(id) ?? []
    if (!list.some((l) => l.task.id === task.id)) list.push({ task, how })
    out.set(id, list)
  }
  const live = tasks.filter((t) => t.state !== 'stopped').sort((a, b) => a.created.localeCompare(b.created))
  for (const t of live) if (t.flow && ids.has(t.flow)) add(t.flow, t, 'field')
  for (const n of nodes) { const t = n.task && live.find((x) => x.id === n.task); if (t) add(n.id, t, 'dot') }
  for (const t of live) if (!t.flow) for (const id of mentioned(t, ids)) add(id, t, 'text')
  for (const list of out.values()) list.sort((a, b) => a.task.created.localeCompare(b.task.created) || a.task.id.localeCompare(b.task.id))
  return out
}

/**
 * 짝 제안 (③, 10/27 "잇기를 누를 때만"): flow 칸이 없는 맡긴 일마다 점 후보 (그 일이 만든 점 먼저, 다음은 글에 적힌 점).
 * 사용자가 "잇기"를 누르면 맡긴 일 파일에 flow 한 줄을 쓴다. 끝난 일 · 폐기한 일은 뺀다
 */
export function pairSuggestions(nodes: Pick<FlowNode, 'id' | 'task'>[], tasks: Task[]): { task: Task; dots: string[] }[] {
  const byTask = new Map<string, { task: Task; dot: string[]; text: string[] }>()
  for (const [id, list] of taskLinks(nodes, tasks)) for (const { task, how } of list) {
    if (task.flow || task.state === 'done' || how === 'field') continue
    const e = byTask.get(task.id) ?? { task, dot: [], text: [] }
    e[how].push(id)
    byTask.set(task.id, e)
  }
  return [...byTask.values()].sort((a, b) => b.task.created.localeCompare(a.task.created))
    .map((e) => ({ task: e.task, dots: [...new Set([...e.dot.sort(), ...e.text.sort()])] }))
}

/** 맡긴 일이 다루는 점: 사용자가 이은 flow 칸만 (그 일이 만든 점 · 글에 적힌 이름은 제안일 뿐) */
export const linkedDot = (t: Pick<Task, 'id' | 'flow'>, nodes: Pick<FlowNode, 'id' | 'task'>[]): string | undefined =>
  t.flow && nodes.some((n) => n.id === t.flow) ? t.flow : undefined

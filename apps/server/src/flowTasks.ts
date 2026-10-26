// 맡긴 일 ↔ 흐름 점 (10/26 결정 "흐름 연결" ①): 흐름 찾기와 STATUS가 이어진 맡긴 일의 결과까지 보이게.
// 짝은 셋 중 먼저 걸리는 것: 맡긴 일의 flow 칸 · 점의 task 칸(그 일이 만든 점) · 맡긴 일 글에 적힌 점 이름.
import type { FlowNode } from '@rw/core/contract/flow'
import type { Task } from '@rw/core/contract/tasks'

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
export function taskLinks(nodes: FlowNode[], tasks: Task[]): Map<string, TaskLink[]> {
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

/** STATUS · 찾기에 쓰는 맡긴 일 상태 이름 (연구 파일이라 한국어) */
export const TASK_STATE_NAME: Record<Task['state'], string> = {
  working: '진행', proposed: '종결 조건 승인 대기', result: '결과 도착 · 판단 대기', paused: '멈춤', done: '끝남', stopped: '폐기',
}

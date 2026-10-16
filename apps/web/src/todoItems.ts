import type { OpenTodo } from './api'
import { openFlowDot } from './FlowView'
import { recordRoute } from './recordsPanelHelpers'
import { go } from './router'

/** 할 일이 붙은 곳으로 간다 (노트 · 블록 노트 · 주제 · 흐름 점). 프로젝트 할 일은 갈 곳이 없다 */
export function openTodoPlace(rid: string, todo: Pick<OpenTodo, 'target' | 'source'>) {
  if (todo.target.startsWith('flow-')) { openFlowDot(rid, { id: todo.source ?? todo.target.slice('flow-'.length) }); return }
  const route = recordRoute(rid, todo, () => undefined)
  if (route) go(route)
}

/** 할 일이 붙은 곳의 이름 (기록 파일 머리). 프로젝트 할 일은 null */
export const todoPlace = (todo: Pick<OpenTodo, 'target' | 'where'>) => todo.target === 'project' ? null : todo.where

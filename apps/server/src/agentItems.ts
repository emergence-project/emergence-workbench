/**
 * 에이전트 대화의 줄로 보일 것 (agentChats.ts에서 나눔, 10/30): 노트 · 파일 고침의 앞뒤 글, git diff 덩어리, 할 일 목록.
 */
import type { Todo } from '@rw/core/contract/agentChats'
import { clip, str } from './agentPolicy.js'

/** 노트 고침 입력에서 보일 것 (앞뒤 글은 줄여서) */
export function editOf(input: Record<string, unknown>): { parts: { old: string; new: string }[]; added: number; removed: number; reason?: string } {
  const edits = Array.isArray(input.edits) ? (input.edits as { old?: unknown; new?: unknown; reason?: unknown }[]) : []
  const lines = (s: string) => (s ? s.split('\n').length : 0)
  let added = 0
  let removed = 0
  const parts = edits.slice(0, 6).map((e) => ({ old: clip(str(e.old), 400), new: clip(str(e.new), 400) }))
  for (const e of edits) { added += lines(str(e.new)); removed += lines(str(e.old)) }
  const reason = str(input.summary) || str(edits[0]?.reason)
  return { parts, added, removed, ...(reason && { reason: clip(reason, 300) }) }
}

/** 파일 고침(Edit · MultiEdit · Write) 입력에서 보일 것 (앱 고치기 대화) */
export function fileEditOf(tool: string, input: Record<string, unknown>): { parts: { old: string; new: string }[]; added: number; removed: number } {
  const lines = (s: string) => (s ? s.split('\n').length : 0)
  const pairs = tool === 'MultiEdit' && Array.isArray(input.edits)
    ? (input.edits as { old_string?: unknown; new_string?: unknown }[]).map((e) => ({ old: str(e.old_string), new: str(e.new_string) }))
    : tool === 'Write' ? [{ old: '', new: str(input.content) }]
      : [{ old: str(input.old_string), new: str(input.new_string) }]
  let added = 0
  let removed = 0
  for (const e of pairs) { added += lines(e.new); removed += lines(e.old) }
  return { parts: pairs.slice(0, 6).map((e) => ({ old: clip(e.old, 400), new: clip(e.new, 400) })), added, removed }
}

/** git diff 한 파일을 고친 곳들로 (덩어리마다 뺀 줄 · 더한 줄, 보이려고 줄인다) */
export function partsOfPatch(patch: string, max = 8): { old: string; new: string }[] {
  const parts: { old: string[]; new: string[] }[] = []
  let cur: { old: string[]; new: string[] } | undefined
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) { cur = { old: [], new: [] }; parts.push(cur); continue }
    if (!cur || line.startsWith('---') || line.startsWith('+++')) continue
    if (line.startsWith('-')) cur.old.push(line.slice(1))
    else if (line.startsWith('+')) cur.new.push(line.slice(1))
  }
  return parts.filter((x) => x.old.length || x.new.length).slice(0, max).map((x) => ({ old: clip(x.old.join('\n'), 1200), new: clip(x.new.join('\n'), 1200) }))
}

const TODO_STATE: Record<string, Todo['state']> = { pending: 'pending', in_progress: 'in_progress', completed: 'completed' }
/** TodoWrite 입력의 할 일 목록 */
export function todosOf(input: Record<string, unknown>): Todo[] {
  const list = Array.isArray(input.todos) ? (input.todos as { content?: unknown; activeForm?: unknown; status?: unknown }[]) : []
  return list.slice(0, 30).map((x) => ({ text: clip(str(x.content), 200), state: TODO_STATE[str(x.status)] ?? 'pending' }))
}

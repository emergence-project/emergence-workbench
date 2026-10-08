import type { KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { listKey } from '@rw/core'

/**
 * 글 입력칸에서 목록 쓰기 (Claude 채팅 입력처럼): "- "로 시작한 줄에서 Enter는 다음 항목, 빈 항목에서 Enter는 목록 끝,
 * Tab / Shift+Tab은 들여쓰기 / 내어쓰기. 처리했으면 true. 한글 조합 중이거나 ⌘·Ctrl·Alt·Shift+Enter는 건드리지 않는다
 */
export function onListKey(e: KeyboardEvent<HTMLTextAreaElement>, setValue: (v: string) => void): boolean {
  if (e.key !== 'Enter' && e.key !== 'Tab') return false
  if (e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.altKey || (e.key === 'Enter' && e.shiftKey)) return false
  const t = e.currentTarget
  const r = listKey(t.value, t.selectionStart, t.selectionEnd, e.key, e.shiftKey)
  if (!r) return false
  e.preventDefault()
  // 바로 그려서 커서를 옮긴다 (다음 프레임까지 미루면 그사이 친 글자가 엉뚱한 자리에 들어간다)
  flushSync(() => setValue(r.value))
  t.setSelectionRange(r.start, r.end)
  return true
}

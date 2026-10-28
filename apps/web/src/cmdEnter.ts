import { useRef, type CompositionEvent, type KeyboardEvent } from 'react'

/**
 * ⌘↵ (윈도에서 Ctrl+↵)로 보내기. 한글을 친 직후 ⌘↵는 조합 중(isComposing)이라 그냥 무시하면 보내지지 않는다 (10/28 피드백 22:18).
 * 그때는 조합이 끝나 마지막 글자까지 입력란에 들어간 뒤에 보낸다.
 */
export function isSendKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && (e.metaKey || e.ctrlKey)
}

export function useCmdEnter(run: () => void): { onKeyDown(e: KeyboardEvent): boolean; onCompositionEnd(e: CompositionEvent): void } {
  const latest = useRef(run)
  latest.current = run
  const pending = useRef(false)
  return {
    /** ⌘↵를 받았으면 true (보냈거나 조합이 끝나면 보냄) */
    onKeyDown(e) {
      if (!isSendKey(e)) return false
      e.preventDefault()
      if (e.nativeEvent.isComposing) pending.current = true
      else latest.current()
      return true
    },
    // 조합이 끝난 글이 상태에 들어가 다시 그린 뒤의 run을 부른다
    onCompositionEnd() {
      if (!pending.current) return
      pending.current = false
      setTimeout(() => latest.current(), 0)
    },
  }
}

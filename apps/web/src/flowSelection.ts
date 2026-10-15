import { useSyncExternalStore } from 'react'

/**
 * 흐름 화면에서 고른 점. 오른쪽 사이드바의 기록이 이 점에 붙는다 (10/15 09:51 피드백:
 * 흐름 화면에서 적은 기록이 어느 점에 대한 것인지 남지 않았다). 흐름 화면을 떠나면 비운다.
 */
export interface FlowSelection { rid: string; id: string; title: string }
let current: FlowSelection | null = null
const listeners = new Set<() => void>()

export function setFlowSelection(next: FlowSelection | null) {
  if (current?.rid === next?.rid && current?.id === next?.id && current?.title === next?.title) return
  current = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function useFlowSelection(rid: string): FlowSelection | null {
  const selection = useSyncExternalStore(subscribe, () => current)
  return selection?.rid === rid ? selection : null
}

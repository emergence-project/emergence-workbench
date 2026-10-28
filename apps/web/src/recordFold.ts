import { useCallback, useSyncExternalStore } from 'react'

/**
 * 기록 줄의 대화 접기 (10/28 피드백 20:57, 시안 X2E8KyUrpZJjk7XbCBov3x 3절): 답이 둘 이상이면 마지막 답만 보이고 앞의 답은 「앞 답 N개」로 접는다.
 * 펼친 기록은 기록마다 이 브라우저에 기억한다. 오른쪽 사이드바와 기록 탭이 같은 값을 쓴다.
 */
const KEY = 'rw-record-open'
const MAX = 300
const listeners = new Set<() => void>()
let cache: string[] | null = null

function read(): string[] {
  if (cache) return cache
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[] } catch { cache = [] }
  if (!Array.isArray(cache)) cache = []
  return cache
}

function write(next: string[]): void {
  cache = next.slice(-MAX)
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* 기억하지 못해도 이번 화면에서는 펼친다 */ }
  for (const l of listeners) l()
}

/** 접을 앞 답의 수: 답이 하나 이하이거나 펼쳤으면 0 */
export function foldedCount(answers: number, open: boolean): number {
  return open || answers < 2 ? 0 : answers - 1
}

export function recordOpenKey(rid: string, target: string, id: string): string {
  return `${rid}:${target}:${id}`
}

export function useRecordOpen(key: string): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => read().includes(key))
  const set = useCallback((v: boolean) => {
    const rest = read().filter((k) => k !== key)
    write(v ? [...rest, key] : rest)
  }, [key])
  return [open, set]
}

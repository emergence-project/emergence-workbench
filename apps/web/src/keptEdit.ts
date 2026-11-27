import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { draftMap } from './unsent'

/**
 * 고치기 창을 Esc · 바깥 누르기 · 취소로 닫아도 고치던 칸이 남게 (11/27 사용자 결정 "추천대로": 맡기기 창처럼).
 * 칸마다 { 열 때의 값, 고친 값 }을 쥐고, 같은 대상의 창을 다시 열 때 열 때의 값이 그대로면 고친 값으로 되살린다.
 * 그 사이 바깥(다른 컴퓨터 · 에이전트)에서 그 칸이 바뀌었으면 옛 고침을 버리고 새 값으로 연다. 저장하면 forgetKept로 지운다.
 * 앱을 새로 열면 없어진다 (unsent.ts: 쥐는 동안은 저절로 하는 새로 고침을 미룬다).
 */
// 값은 JSON 글로 쥔다 (칸 값은 글 · 숫자 · 단순한 객체뿐이고, 되살릴 때 타입 단언 없이 읽게)
const kept = draftMap<{ base: string; value: string }>()
const keyOf = (scope: string, field: string) => `${scope}\u0000${field}`

/** useState 자리에 쓴다. scope는 고치는 대상(예: `topic:<프로젝트>:<주제>`), field는 칸 이름 */
export function useKept<T>(scope: string, field: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const key = keyOf(scope, field)
  const base = JSON.stringify(initial)
  const [value, setValue] = useState<T>(() => {
    const k = kept.get(key)
    if (k && k.base === base) return JSON.parse(k.value)
    kept.delete(key)
    return initial
  })
  // 고친 값이 바뀔 때만 적는다 (저장 뒤 지운 것을 다시 그릴 때 되살리지 않게)
  useEffect(() => {
    const now = JSON.stringify(value)
    if (now === base) kept.delete(key)
    else kept.set(key, { base, value: now })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- base는 열 때의 값으로 충분하다
  }, [key, value])
  return [value, setValue]
}

/** 저장했으면 그 대상의 고침을 모두 지운다 */
export function forgetKept(scope: string): void {
  const prefix = `${scope}\u0000`
  for (const k of [...kept.keys()]) if (k.startsWith(prefix)) kept.delete(k)
}

/** 테스트용: 쥔 칸 수 */
export const keptCount = () => kept.size

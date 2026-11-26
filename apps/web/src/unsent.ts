import { useEffect } from 'react'

/*
 * 보내지 않은 글 (11/26): 저절로 하는 새로 고침(AppUpdate.tsx)이 적던 글을 지우지 않게, 그런 글이 있는지 한곳에서 본다.
 * 편집기의 저장하지 않은 고침은 autosave.ts의 anyPending이 보고, 여기는 입력란의 초안을 본다(메모리에만 있어 새로 고치면 사라진다).
 *  - 화면의 입력란: 사용자가 적은 입력란을 기억해 두고, 아직 화면에 있고 비어 있지 않으면 보내지 않은 글로 본다.
 *  - 화면에서 내려간 초안: 대화 · 답 · 메모마다 글을 쥐는 곳은 draftMap · draftSource로, 부품 안에만 있는 것은 useUnsent로 알린다.
 */
const typed = new Set<HTMLInputElement | HTMLTextAreaElement>()
const sources = new Set<() => boolean>()
/** 글을 적는 input (체크 · 파일 · 숫자 · 비밀번호는 아니다) */
const TEXT_INPUT = new Set(['text', 'search', 'url', 'email', 'tel'])

if (typeof window !== 'undefined') {
  // 사용자가 적을 때만 온다(앱이 값을 넣을 때는 오지 않는다): 받아 온 글을 보여 주기만 하는 입력란은 세지 않는다
  window.addEventListener('input', (e) => {
    const el = e.target
    if (!(el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_INPUT.has(el.type)))) return
    typed.add(el)
    // 화면에서 내려간 입력란을 쥐고 있지 않게 가끔 턴다 (anyUnsent는 새로 고침을 따질 때만 불린다)
    if (typed.size > 64) for (const old of typed) if (!old.isConnected) typed.delete(old)
  }, true)
}

/** 보내지 않은 글이 있는지 */
export function anyUnsent(): boolean {
  for (const el of typed) {
    if (!el.isConnected) typed.delete(el)
    else if (el.value.trim()) return true
  }
  for (const has of sources) if (has()) return true
  return false
}

/** 화면에서 내려간 입력란의 글을 쥐는 곳을 알린다 */
export function draftSource(has: () => boolean): void { sources.add(has) }

/** 키(대화 · 기록 · 프로젝트)마다 초안을 쥐는 Map. 글을 보내거나 비우면 그 키를 지우는 곳에 쓴다 */
export function draftMap<V>(): Map<string, V> {
  const map = new Map<string, V>()
  sources.add(() => map.size > 0)
  return map
}

/** 부품 안에만 있는 보내지 않은 것 (담아 둔 코멘트, 다른 필터에 적어 둔 글): 있는 동안만 알린다 */
export function useUnsent(has: boolean): void {
  useEffect(() => {
    if (!has) return
    const yes = () => true
    sources.add(yes)
    return () => { sources.delete(yes) }
  }, [has])
}

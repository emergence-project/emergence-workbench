import { useEffect, useSyncExternalStore } from 'react'
import { conceptsApi, type ConceptMemo } from './api'
import type { MemoAnchor } from './conceptMemo'
import { openRight } from './noteScreen'

/**
 * 개념노트 메모(concepts/<id>.memo.md)를 본문(고른 글 하이라이트)과 오른쪽 사이드바 메모 칸이 함께 읽고 쓴다.
 * 쓸 때는 늘 마지막으로 읽은 hash를 보내 그사이 바깥에서 바뀐 것을 덮지 않는다(409면 다시 읽는다).
 */
export interface ConceptMemoSlot {
  memo: ConceptMemo | null
  /** 본문에서 글을 골라 "메모"를 누르면 메모 칸이 쓰는 칸을 연다 */
  compose?: { anchor: MemoAnchor; nonce: number }
  /** 메모 칸의 고른 글을 누르면 본문의 그 자리로 */
  reveal?: { anchor: MemoAnchor; nonce: number }
}
const slots = new Map<string, ConceptMemoSlot>()
const listeners = new Set<() => void>()
const empty: ConceptMemoSlot = { memo: null }
let nonce = 0

function patch(id: string, next: Partial<ConceptMemoSlot>) {
  slots.set(id, { ...(slots.get(id) ?? empty), ...next })
  listeners.forEach((listener) => listener())
}

export function useConceptMemo(id: string): ConceptMemoSlot {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    () => slots.get(id) ?? empty,
  )
}

/** 처음 보일 때 한 번 읽는다 (메모 칸은 라이브러리가 바뀔 때마다 loadConceptMemo로 다시 읽는다) */
export function useConceptMemoLoaded(id: string) {
  useEffect(() => { if (!slots.get(id)?.memo) void loadConceptMemo(id) }, [id])
}

export async function loadConceptMemo(id: string): Promise<ConceptMemo | null> {
  try { const memo = await conceptsApi.memo(id); patch(id, { memo }); return memo } catch { patch(id, { memo: null }); return null }
}

/** base는 고칠 때 읽은 메모. 저장 뒤 새 메모를 돌려준다 */
export async function saveConceptMemo(id: string, base: ConceptMemo, text: string): Promise<ConceptMemo> {
  try {
    const memo = await conceptsApi.saveMemo(id, text, base.hash)
    patch(id, { memo })
    return memo
  } catch (e) { void loadConceptMemo(id); throw e }
}

export function composeConceptMemo(id: string, anchor: MemoAnchor) {
  patch(id, { compose: { anchor, nonce: ++nonce } })
  // 프로젝트 안에서는 메모 칸이 오른쪽 사이드바 "정보"에 있다
  openRight('info')
}
export function clearConceptCompose(id: string, n: number) {
  if (slots.get(id)?.compose?.nonce === n) patch(id, { compose: undefined })
}
export function revealConceptMemo(id: string, anchor: MemoAnchor) {
  patch(id, { reveal: { anchor, nonce: ++nonce } })
}

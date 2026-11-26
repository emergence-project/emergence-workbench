/** App.tsx의 훅 둘 (App.tsx에서 나눔): 왼쪽 사이드바 폭, 앱 전체 단축키 */
import { useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { useLayout } from './Workspace'
import type { useGlobalRight, useLeftSide, useStoredFlag } from './phoneLayout'

const SIDE_W = 244, SIDE_MIN = 200, SIDE_MAX = 480

// 왼쪽 사이드바 폭: 오른쪽 경계를 끌어 바꾸고, 두 번 누르면 처음 폭 (10/29 09:15 피드백: 오른쪽처럼 폭 조절)
export function useSideWidth() {
  const [sideW, setSideW] = useState(() => { try { const v = Number(localStorage.getItem('rw-side-width')); return v >= SIDE_MIN && v <= SIDE_MAX ? v : SIDE_W } catch { return SIDE_W } })
  const saveSideW = (w: number) => { setSideW(w); try { localStorage.setItem('rw-side-width', String(w)) } catch { /* 저장 못 해도 이번에는 바뀐다 */ } }
  const dragSide = (e: React.PointerEvent) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = sideW
    let w = w0
    const onMove = (ev: PointerEvent) => { w = Math.min(SIDE_MAX, Math.max(SIDE_MIN, w0 + ev.clientX - x0)); setSideW(w) }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); document.body.classList.remove('resizing'); saveSideW(w) }
    document.body.classList.add('resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return { sideW, dragSide, resetSideW: () => saveSideW(SIDE_W) }
}

// 빠른 메모: 글을 쓰는 중이 아닐 때 M 키 (브라우저에서 ⌘M은 창 최소화라 쓰지 않는다)
export function useAppKeys({ dialog, quickMemo, feedback, search, rid, setLayout, setSideOpen, setGlobalRight, setAgentSide, setSearch, setQuickMemo, agentSideHere, onGlobalPage }: {
  dialog: unknown; quickMemo: boolean; feedback: boolean; search: boolean; rid: string | null | undefined
  setLayout: ReturnType<typeof useLayout>[1]
  setSideOpen: ReturnType<typeof useLeftSide>[1]
  setGlobalRight: ReturnType<typeof useGlobalRight>[1]
  setAgentSide: ReturnType<typeof useStoredFlag>[1]
  setSearch: Dispatch<SetStateAction<boolean>>
  setQuickMemo: Dispatch<SetStateAction<boolean>>
  agentSideHere: MutableRefObject<boolean>
  onGlobalPage: MutableRefObject<boolean>
}): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const typing = !!el && (/^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName) || el.isContentEditable)
      // ⌘\ 왼쪽 사이드바, ⌥⌘\ 오른쪽 사이드바 (⌥를 누르면 e.key가 바뀌어 e.code로 본다)
      if ((e.metaKey || e.ctrlKey) && e.code === 'Backslash' && e.altKey) { e.preventDefault(); if (agentSideHere.current) setAgentSide((v) => !v); else if (onGlobalPage.current) setGlobalRight((v) => !v); else setLayout((l) => ({ ...l, ctx: !l.ctx })); return }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setSideOpen((v) => !v); return }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || dialog || quickMemo || feedback || search) return
      // 전역 검색: "/" (⌘K는 개념노트 편집기의 명령 메뉴라 쓰지 않는다)
      if (e.key === '/') { e.preventDefault(); setSearch(true); return }
      if (!rid) return
      if (e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') { e.preventDefault(); setQuickMemo(true) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [dialog, quickMemo, feedback, search, rid, setLayout, setSideOpen, setGlobalRight, setAgentSide, setSearch, setQuickMemo, agentSideHere, onGlobalPage])
}
